"""
analyze.py — 長回し旅行動画から「意味的な切り替わり点」を検出する

パイプライン:
  1. (必要なら) 動画をGCSへアップロード
  2. Video Intelligence API LABEL_DETECTION (FRAME_MODE) でフレームラベル取得
  3. ラベルconfidenceの時系列ベクトル化 (1秒ビン)
  4. 各時点の「前W秒 vs 後W秒」のコサイン距離 → ピーク = 切り替わり候補
  5. scenes.json + シーンごとのサムネイルを出力 (app.py が読む)

使い方:
  # GCSに既にある場合
  python analyze.py --video movies/1.mov --gcs-uri gs://my-bucket/1.mov --out out

  # ローカルからアップロードも任せる場合 (要 google-cloud-storage)
  python analyze.py --video movies/0612_vlog.mp4 --bucket my-bucket --out out

  # API結果をキャッシュして再利用 (パラメータ調整時に課金されない)
  python analyze.py --video movies/1.mov --out out --use-cache
"""

import argparse
import json
import os
import sys
from collections import defaultdict

import cv2
import numpy as np
from scipy.signal import find_peaks

from google.cloud import videointelligence
from google.protobuf.json_format import MessageToDict, ParseDict


# ──────────────────────────────────────────────────────
# 1. Video Intelligence API
# ──────────────────────────────────────────────────────

def upload_to_gcs(local_path: str, bucket_name: str) -> str:
    from google.cloud import storage  # 任意依存なのでここでimport
    client = storage.Client()
    blob_name = os.path.basename(local_path)
    blob = client.bucket(bucket_name).blob(blob_name)
    print(f"Uploading to gs://{bucket_name}/{blob_name} ...")
    blob.upload_from_filename(local_path)
    return f"gs://{bucket_name}/{blob_name}"


def annotate(gcs_uri: str | None, local_path: str | None,
             timeout: int = 1800):
    """LABEL_DETECTION (FRAME_MODE) を実行して annotation_results[0] を返す"""
    client = videointelligence.VideoIntelligenceServiceClient()
    request = {
        "features": [videointelligence.Feature.LABEL_DETECTION],
        "video_context": {
            "label_detection_config": {
                "label_detection_mode":
                    videointelligence.LabelDetectionMode.FRAME_MODE,
                # 似たラベルを少し抑える (stationary cameraの長回しに有効)
                "stationary_camera": False,
            }
        },
    }
    if gcs_uri:
        request["input_uri"] = gcs_uri
    else:
        # 注意: 10分超の動画はリクエストサイズ制限に掛かりやすい。GCS推奨。
        with open(local_path, "rb") as f:
            request["input_content"] = f.read()

    operation = client.annotate_video(request=request)
    print("Annotating on Video Intelligence API ...")
    return operation.result(timeout=timeout).annotation_results[0]


def annotate_with_cache(args) -> dict:
    """API結果をJSONキャッシュ。パラメータ調整のたびに課金されるのを防ぐ"""
    cache_path = os.path.join(args.out, "api_cache.json")
    if args.use_cache and os.path.exists(cache_path):
        print(f"Using cached API result: {cache_path}")
        with open(cache_path, encoding="utf-8") as f:
            return json.load(f)

    gcs_uri = args.gcs_uri
    if not gcs_uri and args.bucket:
        gcs_uri = upload_to_gcs(args.video, args.bucket)

    result = annotate(gcs_uri, None if gcs_uri else args.video)
    result_dict = MessageToDict(result._pb)
    os.makedirs(args.out, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(result_dict, f, ensure_ascii=False)
    print(f"API result cached: {cache_path}")
    return result_dict


# ──────────────────────────────────────────────────────
# 2. ラベル時系列の行列化
# ──────────────────────────────────────────────────────

def _parse_offset(offset) -> float:
    """MessageToDict後のtime_offsetは '12.5s' のような文字列"""
    if isinstance(offset, str):
        return float(offset.rstrip("s") or 0)
    return float(offset.get("seconds", 0)) + float(offset.get("nanos", 0)) / 1e9


def build_matrix(result_dict: dict, bin_sec: float = 1.0):
    """
    返り値:
      M      : shape (T, L) — t秒ビンにおけるラベルlのconfidence (フレーム単位の値)
      labels : 長さLのラベル名リスト
    重要: 旧コードの「全フレーム平均confidence」ではなく、
          各フレーム自身のconfidenceをそのビンに入れる。
    """
    series: dict[str, dict[int, float]] = defaultdict(dict)
    max_bin = 0
    for ann in result_dict.get("frameLabelAnnotations", []):
        label = ann["entity"]["description"]
        for fr in ann.get("frames", []):
            t = _parse_offset(fr.get("timeOffset", "0s"))
            b = int(t // bin_sec)
            conf = float(fr.get("confidence", 0.0))
            series[label][b] = max(series[label].get(b, 0.0), conf)
            max_bin = max(max_bin, b)

    labels = sorted(series.keys())
    M = np.zeros((max_bin + 1, len(labels)), dtype=np.float32)
    for j, lab in enumerate(labels):
        for b, c in series[lab].items():
            M[b, j] = c
    return M, labels


# ──────────────────────────────────────────────────────
# 3. 切り替わり点検出 (前後ウィンドウのコサイン距離)
# ──────────────────────────────────────────────────────

def boundary_scores(M: np.ndarray, win: int) -> np.ndarray:
    """score[t] = 1 - cos( mean(M[t-win:t]), mean(M[t:t+win]) )"""
    # ラベル抜けノイズを抑える軽い時間方向スムージング
    k = np.ones(3) / 3
    Ms = np.apply_along_axis(
        lambda x: np.convolve(x, k, mode="same"), 0, M)

    T = len(Ms)
    score = np.zeros(T)
    for t in range(win, T - win):
        a = Ms[t - win:t].mean(axis=0)
        b = Ms[t:t + win].mean(axis=0)
        na, nb = np.linalg.norm(a), np.linalg.norm(b)
        if na > 1e-8 and nb > 1e-8:
            score[t] = 1.0 - float(a @ b) / (na * nb)
    return score


def detect_boundaries(score: np.ndarray, min_scene_sec: int,
                      sensitivity: float):
    """
    sensitivity を上げるほど候補が増える (prominenceしきい値が下がる)。
    返り値: 境界秒のリスト, 各境界のスコア
    """
    prom = max(score.std(), 1e-6) * (2.0 - sensitivity)
    peaks, props = find_peaks(score, distance=min_scene_sec, prominence=prom)
    return peaks.tolist(), [float(score[p]) for p in peaks]


# ──────────────────────────────────────────────────────
# 4. シーン情報 + サムネイル
# ──────────────────────────────────────────────────────

def make_scenes(M, labels, peaks, peak_scores, duration_sec, top_n=5):
    bounds = [0] + peaks + [int(duration_sec)]
    scenes = []
    for i in range(len(bounds) - 1):
        s, e = bounds[i], bounds[i + 1]
        seg = M[s:min(e, len(M))]
        if len(seg) == 0:
            continue
        mean_conf = seg.mean(axis=0)
        order = np.argsort(mean_conf)[::-1][:top_n]
        scenes.append({
            "id": i,
            "start": float(s),
            "end": float(e),
            "labels": [
                {"name": labels[j], "score": round(float(mean_conf[j]), 3)}
                for j in order if mean_conf[j] > 0.01
            ],
            # このシーンが「前と切り替わった」確からしさ (先頭シーンはNone)
            "boundary_score": round(peak_scores[i - 1], 3) if i > 0 else None,
        })
    return scenes


def save_thumbnails(video_path, scenes, out_dir, per_scene=3):
    """各シーンから等間隔で per_scene 枚サムネイルを保存"""
    thumb_dir = os.path.join(out_dir, "thumbs")
    os.makedirs(thumb_dir, exist_ok=True)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"WARN: cannot open {video_path}; skip thumbnails")
        return
    for sc in scenes:
        length = sc["end"] - sc["start"]
        ts = [sc["start"] + length * (k + 1) / (per_scene + 1)
              for k in range(per_scene)]
        paths = []
        for k, t in enumerate(ts):
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, frame = cap.read()
            if not ok:
                continue
            h, w = frame.shape[:2]
            scale = 320 / w
            frame = cv2.resize(frame, (320, int(h * scale)))
            p = os.path.join(thumb_dir, f"scene{sc['id']:03d}_{k}.jpg")
            cv2.imwrite(p, frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            paths.append(os.path.relpath(p, out_dir))
        sc["thumbs"] = paths
    cap.release()


def get_duration(video_path) -> float:
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    n = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    cap.release()
    return n / fps if fps else 0.0


# ──────────────────────────────────────────────────────
# main
# ──────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True, help="ローカル動画パス (サムネイル抽出に使用)")
    ap.add_argument("--gcs-uri", default=None, help="gs://bucket/file (10分超は必須推奨)")
    ap.add_argument("--bucket", default=None, help="指定するとローカル動画を自動アップロード")
    ap.add_argument("--out", default=None,
                    help="出力ディレクトリ。省略時は out/<動画名> を自動生成")
    ap.add_argument("--use-cache", action="store_true",
                    help="out/api_cache.json があればAPIを呼ばず再利用")
    ap.add_argument("--win", type=int, default=15,
                    help="前後比較ウィンドウ秒数。場面転換が緩やかなら大きく")
    ap.add_argument("--min-scene", type=int, default=20, help="最小シーン長(秒)")
    ap.add_argument("--sensitivity", type=float, default=1.0,
                    help="0.5(候補少なめ)〜1.5(多め)")
    ap.add_argument("--top-n", type=int, default=5, help="シーンごとの表示ラベル数")
    args = ap.parse_args()

    # 出力先未指定なら動画名から自動生成: movies/1.mov -> out/1
    if args.out is None:
        stem = os.path.splitext(os.path.basename(args.video))[0]
        args.out = os.path.join("out", stem)
    print(f"output dir: {args.out}")

    os.makedirs(args.out, exist_ok=True)

    result_dict = annotate_with_cache(args)
    M, labels = build_matrix(result_dict)
    if len(labels) == 0:
        sys.exit("ラベルが取得できませんでした。")
    print(f"labels={len(labels)}, duration_bins={len(M)}")

    score = boundary_scores(M, win=args.win)
    peaks, peak_scores = detect_boundaries(
        score, min_scene_sec=args.min_scene, sensitivity=args.sensitivity)
    print(f"boundary candidates: {len(peaks)} -> {peaks}")

    duration = get_duration(args.video) or float(len(M))
    scenes = make_scenes(M, labels, peaks, peak_scores, duration,
                         top_n=args.top_n)
    save_thumbnails(args.video, scenes, args.out)

    out = {
        "video": os.path.abspath(args.video),
        "duration": duration,
        "params": {"win": args.win, "min_scene": args.min_scene,
                   "sensitivity": args.sensitivity},
        "boundary_curve": [round(float(s), 4) for s in score],
        "scenes": scenes,
    }
    out_path = os.path.join(args.out, "scenes.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"saved: {out_path}")
    for sc in scenes:
        names = ", ".join(l["name"] for l in sc["labels"])
        print(f"  [{sc['id']:02d}] {sc['start']:7.1f}s ~ {sc['end']:7.1f}s : {names}")

if __name__ == "__main__":
    main()

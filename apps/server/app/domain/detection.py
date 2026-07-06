from __future__ import annotations

from dataclasses import dataclass
import numpy as np
from scipy.signal import find_peaks

@dataclass(frozen=True)
class LabelFrame:
    time_ms: int
    confidence: float #信頼度
    
@dataclass(frozen=True)
class LabelTrack:
    description: str # ラベル名
    frames: list[LabelFrame] #時間と信頼度
    
@dataclass
class Scene:
    scene_index: int
    start_ms: int
    end_ms: int
    labels: list[str]
    boundary_score: float | None = None
    
    
#解析本体

#ラベルの行列化
def build_matrix(tracks: list[LabelTrack], *, bin_ms:int = 1000):
    series: dict[str, dict[int,float]] = {}
    max_bin = 0
    for track in tracks:
        bucket = series.setdefault(track.description, {})
        for fr in track.frames:
            b = fr.time_ms // bin_ms
            bucket[b] = max(bucket.get(b, 0.0), fr.confidence)
            max_bin = max(max_bin, b)
                
    labels = sorted(series.keys())
    M = np.zeros((max_bin + 1, len(labels)), dtype=np.float32)
    for j, lab in enumerate(labels):
        for b, c in series[lab].items():
            M[b, j] = c
    return M, labels

#スコア
def boundary_scores(M: np.ndarray, *, win: int = 15) -> np.ndarray:
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

#ピーク抽出
def detect_boundaries(score: np.ndarray, *, min_scene_bins: int, sensitivity: float = 1.0):
    prom = max(float(score.std()), 1e-6) * (2.0 - sensitivity)
    peaks, _ = find_peaks(score, distance=max(1, min_scene_bins),
                          prominence=prom)
    return peaks.tolist(), [float(score[p]) for p in peaks]


#シーン情報の組み立て
def make_scenes(M, labels, peaks, peak_scores, duration_ms: int, *, bin_ms: int = 1000, top_n: int = 5) -> list[Scene]:
    n_bins = len(M)
    bounds = [0] + list(peaks) + [n_bins]
    scenes: list[Scene] = []
    idx = 0
    for i in range(len(bounds) - 1):
        s_bin, e_bin = bounds[i], bounds[i + 1]
        if e_bin <= s_bin:
            continue

        start_ms = min(s_bin * bin_ms, duration_ms)
        is_last = (i == len(bounds) - 2)
        # 最後のシーンの終端は必ず「変換後mp4の長さ」に揃える
        end_ms = duration_ms if is_last else min(e_bin * bin_ms, duration_ms)
        if end_ms <= start_ms:
            continue

        seg = M[s_bin:e_bin]
        names: list[str] = []
        if len(seg) > 0:
            mean_conf = seg.mean(axis=0)
            order = np.argsort(mean_conf)[::-1][:top_n]
            names = [labels[j] for j in order if mean_conf[j] > 0.01]

        bscore = None
        if i > 0 and (i - 1) < len(peak_scores):
            bscore = round(peak_scores[i - 1], 3)

        scenes.append(Scene(
            scene_index=idx,
            start_ms=int(start_ms),
            end_ms=int(end_ms),
            labels=names,
            boundary_score=bscore,
        ))
        idx += 1
    return scenes

#一括呼び出し
def detect_scenes(
    tracks: list[LabelTrack],
    duration_ms: int,
    *,
    bin_ms: int = 1000,
    win: int = 15,
    min_scene_ms: int = 20000,
    sensitivity: float = 1.0,
    top_n: int = 5,
) -> list[Scene]:
    M, labels = build_matrix(tracks, bin_ms=bin_ms)
    if len(labels) == 0:
        return []
    score = boundary_scores(M, win=win)
    min_scene_bins = max(1, round(min_scene_ms / bin_ms))
    peaks, peak_scores = detect_boundaries(
        score, min_scene_bins=min_scene_bins, sensitivity=sensitivity)
    return make_scenes(M, labels, peaks, peak_scores, duration_ms, bin_ms=bin_ms, top_n=top_n)
    

def scene_to_dict(scene: Scene) -> dict:
    d = {
        "sceneIndex": scene.scene_index,
        "startMs": scene.start_ms,
        "endMs": scene.end_ms,
        "labels": scene.labels,
    }
    if scene.boundary_score is not None:
        d["boundaryScore"] = scene.boundary_score
    return d
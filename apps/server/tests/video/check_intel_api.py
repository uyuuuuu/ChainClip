"""intelligence.py の実API動作確認スクリプト（手動実行用）

apps/server/ で実行する:
    python check_intel_api.py
    python check_intel_api.py --key original/xxxx.mov
    python check_intel_api.py --use-cache        # APIを叩かず前回結果を再利用

方針:
- バケット名は .env の GCS_BUCKET_NAME から取得する（環境依存の値をコードに直書きしない）
- GCP認証は .env の GOOGLE_APPLICATION_CREDENTIALS 任せ（load_dotenvで環境変数に載る）
- 初回はVI APIを実際に叩く（数分・課金あり）。結果は fixtures/ にキャッシュされ、
  次回以降は --use-cache で無料再利用できる。
"""

from __future__ import annotations

import argparse
import os

from dotenv import load_dotenv

load_dotenv()  # apps/server/.env を環境変数に読み込む（GCS_BUCKET_NAME 等）

from app.infra.video.intelligence import fetch_labels
from app.domain.detection import detect_scenes

# バケット内のオブジェクトキー（gs://<bucket>/<key> の <key> 部分）。
# これ自体は秘密ではないので既定値として置いておく。別の動画で試すなら --key で上書き。
DEFAULT_KEY = (
    "original/c09907f9-a21e-477d-a2d6-3d43ad6f6cc9/"
    "6252593c-4c1e-46ed-87dd-6cbf845aa092.mov"
)

CACHE_PATH = "fixtures/intel_cache.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--key", default=DEFAULT_KEY,
                        help="バケット内のオブジェクトキー")
    parser.add_argument("--use-cache", action="store_true",
                        help="APIを叩かず fixtures のキャッシュを再利用する")
    args = parser.parse_args()

    bucket = os.environ["GCS_BUCKET_NAME"] 
    gcs_uri = f"gs://{bucket}/{args.key}"

    print(f"解析対象: {gcs_uri}")
    tracks = fetch_labels(
        gcs_uri=gcs_uri,
        cache_path=CACHE_PATH,
        use_cache=args.use_cache,
    )

    print(f"\n{len(tracks)} ラベル取得")
    for t in tracks[:10]:
        print(f"  {t.description:20s} {len(t.frames)} frames")

    # ついでにシーン検出まで通す（durationはラベルの最終フレーム時刻から概算）
    times = [f.time_ms for t in tracks for f in t.frames]
    if times:
        approx_duration_ms = max(times)
        scenes = detect_scenes(tracks, duration_ms=approx_duration_ms)
        print(f"\n{len(scenes)} シーン検出（duration≈{approx_duration_ms}ms・概算）")
        for s in scenes:
            print(f"  scene{s.scene_index}: "
                  f"{s.start_ms}–{s.end_ms}ms  {s.labels}")


if __name__ == "__main__":
    main()
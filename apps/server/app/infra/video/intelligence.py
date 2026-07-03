from __future__ import annotations

import json
import os

# domain の入力DTOだけに依存する
from app.domain.detection import LabelFrame, LabelTrack

class VideoIntelligenceError(Exception):
    """VI API 呼び出しに失敗したときの例外"""

def _offset_to_ms(offset) -> int:
    if isinstance(offset, str):
        return int(round(float(offset.rstrip("s") or 0) * 1000))
    sec = float(offset.get("seconds", 0))
    nanos = float(offset.get("nanos", 0))
    return int(round(sec * 1000 + nanos / 1e6))

def parse_annotation(raw: dict) -> list[LabelTrack]:
    tracks: list[LabelTrack] = []
    for ann in raw.get("frameLabelAnnotations", []):
        description = ann["entity"]["description"]
        frames = [
            LabelFrame(
                time_ms=_offset_to_ms(fr.get("timeOffset", "0s")),
                confidence=float(fr.get("confidence", 0.0)),
            )
            for fr in ann.get("frames", [])
        ]
        tracks.append(LabelTrack(description=description, frames=frames))
    return tracks


#VI APIを叩いて生dictを返す
def _call_api(gcs_uri: str, timeout: int = 1800) -> dict:
    from google.cloud import videointelligence
    from google.protobuf.json_format import MessageToDict

    client = videointelligence.VideoIntelligenceServiceClient()
    request = {
        "features": [videointelligence.Feature.LABEL_DETECTION],
        "input_uri": gcs_uri,
        "video_context": {
            "label_detection_config": {
                "label_detection_mode":
                    videointelligence.LabelDetectionMode.FRAME_MODE,
                "stationary_camera": False,
            }
        },
    }
    operation = client.annotate_video(request=request)
    result = operation.result(timeout=timeout).annotation_results[0]
    return MessageToDict(result._pb)


def fetch_labels(
    gcs_uri: str | None = None,
    *,
    cache_path: str | None = None,
    use_cache: bool = False,
) -> list[LabelTrack]:
    if use_cache and cache_path and os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            return parse_annotation(json.load(f))

    if not gcs_uri:
        raise ValueError("gcs_uri が無く、有効なキャッシュもありません。")

    raw = _call_api(gcs_uri)

    if cache_path:
        os.makedirs(os.path.dirname(cache_path) or ".", exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(raw, f, ensure_ascii=False)

    return parse_annotation(raw)

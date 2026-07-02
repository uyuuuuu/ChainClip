from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path


class FfmpegConversionError(Exception):
    """FFmpegによる変換・解析処理に失敗した場合。"""


def convert_to_mp4(input_path: Path, output_path: Path) -> None:
    """元動画をH.264/AAC mp4に変換する。"""
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(input_path),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            str(output_path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise FfmpegConversionError(result.stderr)


@dataclass
class VideoProbe:
    duration_ms: int
    width: int
    height: int


def probe(path: Path) -> VideoProbe:
    """ffprobeで動画の長さ(ミリ秒)・幅・高さを取得する。"""
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height:format=duration",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise FfmpegConversionError(result.stderr)

    data = json.loads(result.stdout)
    stream = data["streams"][0]
    return VideoProbe(
        duration_ms=round(float(data["format"]["duration"]) * 1000),
        width=stream["width"],
        height=stream["height"],
    )

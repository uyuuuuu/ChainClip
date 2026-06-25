from __future__ import annotations

import subprocess
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


def get_duration_ms(path: Path) -> int:
    """ffprobeで動画の長さ(ミリ秒)を取得する。"""
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise FfmpegConversionError(result.stderr)
    return round(float(result.stdout.strip()) * 1000)

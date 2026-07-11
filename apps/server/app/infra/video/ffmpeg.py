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


def render_cut(
    input_path: Path,
    output_path: Path,
    *,
    start_ms: int,
    end_ms: int,
    crop_width: int,
    crop_height: int,
    crop_x: int,
    crop_y: int,
    output_width: int,
    output_height: int,
    fps: int,
) -> None:
    """変換後mp4から1カット分を切り出し、crop→scaleでtransform・output解像度に整形する。"""
    start_sec = start_ms / 1000
    duration_sec = (end_ms - start_ms) / 1000
    filter_expr = (
        f"crop={crop_width}:{crop_height}:{crop_x}:{crop_y},"
        f"scale={output_width}:{output_height},fps={fps}"
    )
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            str(start_sec),
            "-i",
            str(input_path),
            "-t",
            str(duration_sec),
            "-vf",
            filter_expr,
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


def concat_cuts(
    segment_paths: list[Path],
    output_path: Path,
    *,
    transition_type: str,
    transition_duration_ms: int,
) -> None:
    """複数カットをtransitionで繋いで1本のmp4にする。"""
    if len(segment_paths) == 1 or transition_type == "none":
        _concat_none(segment_paths, output_path)
    else:
        _concat_fade(segment_paths, output_path, transition_duration_ms=transition_duration_ms)


def _concat_none(segment_paths: list[Path], output_path: Path) -> None:
    list_file = output_path.parent / "concat_list.txt"
    list_file.write_text(
        "\n".join(f"file '{path.resolve().as_posix()}'" for path in segment_paths),
        encoding="utf-8",
    )
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-c",
            "copy",
            str(output_path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise FfmpegConversionError(result.stderr)


def _concat_fade(segment_paths: list[Path], output_path: Path, *, transition_duration_ms: int) -> None:
    transition_sec = transition_duration_ms / 1000
    durations = [probe(path).duration_ms / 1000 for path in segment_paths]

    inputs: list[str] = []
    for path in segment_paths:
        inputs += ["-i", str(path)]

    filter_parts: list[str] = []
    cumulative = durations[0]
    prev_v_label = "0:v"
    prev_a_label = "0:a"
    for i in range(1, len(segment_paths)):
        offset = max(cumulative - transition_sec, 0)
        v_label = f"v{i}"
        a_label = f"a{i}"
        filter_parts.append(
            f"[{prev_v_label}][{i}:v]xfade=transition=fade:duration={transition_sec}:offset={offset}[{v_label}]"
        )
        filter_parts.append(f"[{prev_a_label}][{i}:a]acrossfade=d={transition_sec}[{a_label}]")
        prev_v_label = v_label
        prev_a_label = a_label
        cumulative += durations[i] - transition_sec

    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            *inputs,
            "-filter_complex",
            ";".join(filter_parts),
            "-map",
            f"[{prev_v_label}]",
            "-map",
            f"[{prev_a_label}]",
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

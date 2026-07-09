from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Literal

# 出力設定は固定値(設計書「出力アスペクト/解像度/fps」)。ユーザーからは受け取らない。
OUTPUT_ASPECT_RATIO = "1:1"
OUTPUT_WIDTH = 1080
OUTPUT_HEIGHT = 1080
OUTPUT_FPS = 30

# トランジションの長さは設計書に規定が無いため、暫定の固定値とする。
TRANSITION_DURATION_MS = 400


@dataclass
class Transform:
    zoom: float
    offset_x: float
    offset_y: float


@dataclass
class Cut:
    cut_id: str
    order: int
    clip_id: uuid.UUID
    start_ms: int
    end_ms: int
    transform: Transform


@dataclass
class EditConfig:
    """projects.edit_config(jsonb)に対応する値オブジェクト。"""

    version: int
    transition: Literal["none", "fade"]
    timeline: list[Cut]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "EditConfig":
        cuts = sorted(data["timeline"], key=lambda cut: cut["order"])
        return cls(
            version=data["version"],
            transition=data["transition"],
            timeline=[_cut_from_dict(cut) for cut in cuts],
        )


def _cut_from_dict(data: dict[str, Any]) -> Cut:
    return Cut(
        cut_id=data["cutId"],
        order=data["order"],
        clip_id=uuid.UUID(data["clipId"]),
        start_ms=data["startMs"],
        end_ms=data["endMs"],
        transform=Transform(
            zoom=data["transform"]["zoom"],
            offset_x=data["transform"]["offsetX"],
            offset_y=data["transform"]["offsetY"],
        ),
    )


def crop_rect(
    *,
    src_width: int,
    src_height: int,
    target_width: int,
    target_height: int,
    zoom: float,
    offset_x: float,
    offset_y: float,
) -> tuple[int, int, int, int]:
    """zoom/offsetから元フレーム上の切り抜き矩形(width, height, x, y)を計算する。

    zoom=1.0では出力の縦横比を保ったまま元フレームに収まる最大範囲を切り抜く。
    offset_x/offset_yは中央からのずれを正規化座標(-1.0〜1.0)で表し、
    切り抜き矩形が動ける範囲に対する割合として扱う。
    """
    target_ratio = target_width / target_height
    src_ratio = src_width / src_height

    if src_ratio > target_ratio:
        base_height = src_height
        base_width = src_height * target_ratio
    else:
        base_width = src_width
        base_height = src_width / target_ratio

    crop_width = base_width / zoom
    crop_height = base_height / zoom

    max_offset_x = (src_width - crop_width) / 2
    max_offset_y = (src_height - crop_height) / 2

    x = (src_width - crop_width) / 2 + offset_x * max_offset_x
    y = (src_height - crop_height) / 2 + offset_y * max_offset_y

    x = min(max(x, 0), src_width - crop_width)
    y = min(max(y, 0), src_height - crop_height)

    return round(crop_width), round(crop_height), round(x), round(y)

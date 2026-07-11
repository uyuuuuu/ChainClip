from __future__ import annotations

import uuid

from app.domain.edit_config import EditConfig, crop_rect


def test_crop_rect_at_zoom_1_fits_largest_area_for_target_ratio() -> None:
    """zoom=1.0では元フレームに収まる最大範囲(target比率)を切り抜く。"""
    width, height, x, y = crop_rect(
        src_width=1920,
        src_height=1080,
        target_width=9,
        target_height=16,
        zoom=1.0,
        offset_x=0.0,
        offset_y=0.0,
    )

    assert height == 1080
    assert width == round(1080 * 9 / 16)
    assert y == 0
    assert x == round((1920 - width) / 2)


def test_crop_rect_zoom_in_shrinks_crop_area() -> None:
    """zoomを大きくすると切り抜き範囲が小さくなる(拡大表示になる)。"""
    _, height_zoom1, _, _ = crop_rect(
        src_width=1920, src_height=1080, target_width=9, target_height=16, zoom=1.0, offset_x=0.0, offset_y=0.0
    )
    _, height_zoom2, _, _ = crop_rect(
        src_width=1920, src_height=1080, target_width=9, target_height=16, zoom=2.0, offset_x=0.0, offset_y=0.0
    )

    assert height_zoom2 == round(height_zoom1 / 2)


def test_crop_rect_offset_is_clamped_within_source_frame() -> None:
    """offsetが極端でも切り抜き矩形はソースフレーム内に収まる。"""
    width, height, x, y = crop_rect(
        src_width=1920,
        src_height=1080,
        target_width=9,
        target_height=16,
        zoom=1.0,
        offset_x=10.0,
        offset_y=10.0,
    )

    assert 0 <= x <= 1920 - width
    assert 0 <= y <= 1080 - height


def test_edit_config_from_dict_orders_timeline_by_order() -> None:
    """timelineはorderの昇順に並び替えられる。"""
    clip_id = str(uuid.uuid4())
    data = {
        "version": 1,
        "transition": "fade",
        "timeline": [
            {
                "cutId": "b",
                "order": 1,
                "clipId": clip_id,
                "startMs": 1000,
                "endMs": 2000,
                "transform": {"zoom": 1.0, "offsetX": 0.0, "offsetY": 0.0},
            },
            {
                "cutId": "a",
                "order": 0,
                "clipId": clip_id,
                "startMs": 0,
                "endMs": 1000,
                "transform": {"zoom": 1.0, "offsetX": 0.0, "offsetY": 0.0},
            },
        ],
    }

    edit_config = EditConfig.from_dict(data)

    assert [cut.cut_id for cut in edit_config.timeline] == ["a", "b"]
    assert edit_config.transition == "fade"

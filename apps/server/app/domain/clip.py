from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class ClipStatus(str, Enum):
    UPLOADING = "uploading"     # アップロードURL発行済み、まだアップロード中
    UPLOADED = "uploaded"       # アップロード完了
    PROCESSING = "processing"   # 解析・変換中
    READY = "ready"             # 解析・変換完了
    FAILED = "failed"           # 失敗


@dataclass
class Clip:
    """project_clipsテーブルに対応するエンティティ。"""

    id: uuid.UUID
    project_id: uuid.UUID
    clip_index: int
    original_filename: str
    status: ClipStatus
    content_type: str | None = None
    size_bytes: int | None = None
    duration_ms: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def create(
        cls,
        *,
        project_id: uuid.UUID,
        clip_index: int,
        original_filename: str,
        content_type: str | None,
        size_bytes: int | None,
    ) -> "Clip":
        """新規clipを作成する。statusはuploading。"""
        return cls(
            id=uuid.uuid4(),
            project_id=project_id,
            clip_index=clip_index,
            original_filename=original_filename,
            status=ClipStatus.UPLOADING,
            content_type=content_type,
            size_bytes=size_bytes,
        )

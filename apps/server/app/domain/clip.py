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
    error_code: str | None = None
    error_message: str | None = None
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

    def mark_uploaded(self) -> None:
        """モバイルからアップロード完了通知が来たら呼ぶ。"""
        self.status = ClipStatus.UPLOADED

    def mark_processing(self) -> None:
        """prepare workerが解析・変換を開始したら呼ぶ。"""
        self.status = ClipStatus.PROCESSING

    def mark_ready(self, *, duration_ms: int) -> None:
        """解析・変換が完了したら呼ぶ。"""
        self.status = ClipStatus.READY
        self.duration_ms = duration_ms

    def mark_failed(self, *, error_code: str, error_message: str) -> None:
        """解析・変換に失敗したら呼ぶ。"""
        self.status = ClipStatus.FAILED
        self.error_code = error_code
        self.error_message = error_message

    def original_object_key(self) -> str:
        """GCS上の元動画オブジェクトキー。"""
        ext = ""
        if "." in self.original_filename:
            ext = "." + self.original_filename.rsplit(".", 1)[1].lower()
        return f"original/{self.project_id}/{self.id}{ext}"

    def converted_object_key(self) -> str:
        """GCS上の変換後mp4オブジェクトキー。"""
        return f"converted/{self.project_id}/{self.id}.mp4"

    def scene_candidates_object_key(self) -> str:
        """GCS上のシーン区間JSONオブジェクトキー。"""
        return f"scenes/{self.project_id}/{self.id}.json"

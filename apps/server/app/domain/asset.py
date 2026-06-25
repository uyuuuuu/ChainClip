from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class AssetKind(str, Enum):
    ORIGINAL_CLIP = "original_clip"        # 元動画
    CONVERTED_CLIP = "converted_clip"      # mp4変換済みの中間動画
    SCENE_CANDIDATES = "scene_candidates"  # アプリ表示用のシーン区間JSON
    FINAL_CLIP = "final_clip"              # 完成動画


class StorageProvider(str, Enum):
    GCS = "gcs"
    R2 = "r2"


@dataclass
class ProjectAsset:
    """project_assetsテーブルに対応するエンティティ。GCS/R2に保存したファイルを表す。"""

    id: uuid.UUID
    project_id: uuid.UUID
    kind: AssetKind
    storage_provider: StorageProvider
    bucket: str
    object_key: str
    clip_id: uuid.UUID | None = None
    public_url: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None
    created_at: datetime | None = None

    @classmethod
    def create(
        cls,
        *,
        project_id: uuid.UUID,
        kind: AssetKind,
        storage_provider: StorageProvider,
        bucket: str,
        object_key: str,
        clip_id: uuid.UUID | None = None,
        public_url: str | None = None,
        content_type: str | None = None,
        size_bytes: int | None = None,
    ) -> "ProjectAsset":
        """新規assetを作成する。"""
        return cls(
            id=uuid.uuid4(),
            project_id=project_id,
            kind=kind,
            storage_provider=storage_provider,
            bucket=bucket,
            object_key=object_key,
            clip_id=clip_id,
            public_url=public_url,
            content_type=content_type,
            size_bytes=size_bytes,
        )

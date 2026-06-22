from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class ProjectStatus(str, Enum):
    DRAFT = "draft"         # 作成ボタン押した
    UPLOADING = "uploading"  # 動画アップロード中
    UPLOADED = "uploaded"   # 動画アップロード完了
    PREPARING = "preparing"  # 変換&解析開始
    READY = "ready"         # 変換&解析終了、シーン区切り決定
    RENDERING = "rendering"  # 結合中
    COMPLETED = "completed"  # 結合完了
    FAILED = "failed"       # 失敗


@dataclass
class Project:
    """projectsテーブルに対応するエンティティ。"""

    id: uuid.UUID
    device_id: uuid.UUID
    status: ProjectStatus
    access_token: str
    title: str | None = None
    description: str | None = None
    share_slug: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def create(cls, *, device_id: uuid.UUID) -> "Project":
        """新規プロジェクトを作成する。statusはdraft、access_tokenはランダム生成。"""
        return cls(
            id=uuid.uuid4(),
            device_id=device_id,
            status=ProjectStatus.DRAFT,
            access_token=secrets.token_urlsafe(32),
        )

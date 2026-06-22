from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from app.domain.error import AccessDeniedError, InvalidProjectStateError


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

    def verify_access(self, access_token: str) -> None:
        """access_tokenが一致しない場合はAccessDeniedErrorを投げる。"""
        if not secrets.compare_digest(self.access_token, access_token):
            raise AccessDeniedError("access_token does not match")

    def mark_uploading(self) -> None:
        """clipのアップロードURLを発行したら呼ぶ。"""
        self.status = ProjectStatus.UPLOADING

    def assert_status(self, expected: ProjectStatus) -> None:
        """現在のstatusがexpectedでない場合はInvalidProjectStateErrorを投げる。"""
        if self.status != expected:
            raise InvalidProjectStateError(
                f"expected status={expected.value} but actual={self.status.value}"
            )

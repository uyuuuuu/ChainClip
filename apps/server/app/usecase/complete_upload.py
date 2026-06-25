from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.domain.clip import ClipStatus
from app.domain.error import GcsObjectNotFoundError, InvalidClipError, ProjectNotFoundError
from app.infra.db.repository import ClipRepo, ProjectRepo
from app.infra.storage import gcs


@dataclass
class CompleteUploadResult:
    clip_id: uuid.UUID
    status: str


def complete_upload(
    project_repo: ProjectRepo,
    clip_repo: ClipRepo,
    *,
    clip_id: uuid.UUID,
    access_token: str,
) -> CompleteUploadResult:
    """PUT /clips/{clipId}/upload-complete: clip単位でアップロード完了通知、GCS object存在確認、
    project_clips.status=uploaded。全clipが揃ったらproject.status=uploadedにする。"""
    clip = clip_repo.get_by_id(clip_id)
    if clip is None:
        raise InvalidClipError(f"clip not found: {clip_id}")

    project = project_repo.get_by_id(clip.project_id)
    if project is None:
        raise ProjectNotFoundError(f"project not found: {clip.project_id}")

    project.verify_access(access_token)

    if not gcs.object_exists(clip.original_object_key()):
        raise GcsObjectNotFoundError(f"gcs object not found: {clip.original_object_key()}")

    clip.mark_uploaded()
    clip_repo.update(clip)

    other_clips = clip_repo.list_by_project_id(project.id)
    if all(c.status == ClipStatus.UPLOADED for c in other_clips):
        project.mark_uploaded()
        project_repo.update(project)

    return CompleteUploadResult(clip_id=clip.id, status=clip.status.value)

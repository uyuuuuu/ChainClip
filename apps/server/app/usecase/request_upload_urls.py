from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.domain.clip import Clip
from app.domain.error import InvalidClipError, ProjectNotFoundError
from app.domain.project import ProjectStatus
from app.infra.db.repository import ClipRepo, ProjectRepo
from app.infra.storage.gcs import generate_signed_upload_url

UPLOAD_URL_EXPIRES_IN_SECONDS = 600


@dataclass
class ClipUploadRequestItem:
    original_filename: str
    content_type: str
    size_bytes: int


@dataclass
class ClipUploadUrl:
    clip_id: uuid.UUID
    clip_index: int
    upload_url: str


def request_upload_urls(
    project_repo: ProjectRepo,
    clip_repo: ClipRepo,
    *,
    project_id: uuid.UUID,
    access_token: str,
    clips: list[ClipUploadRequestItem],
) -> list[ClipUploadUrl]:
    """POST /projects/{projectId}/clips/upload-urls: 動画のバリデーション、複数clip作成、
    GCSアップロード用signed URL発行、project.status=uploading。"""
    project = project_repo.get_by_id(project_id)
    if project is None:
        raise ProjectNotFoundError(f"project not found: {project_id}")

    project.verify_access(access_token)
    project.assert_status(ProjectStatus.DRAFT)

    for item in clips:
        if not item.content_type.startswith("video/"):
            raise InvalidClipError(f"video file only: {item.original_filename}")

    new_clips = [
        Clip.create(
            project_id=project.id,
            clip_index=index,
            original_filename=item.original_filename,
            content_type=item.content_type,
            size_bytes=item.size_bytes,
        )
        for index, item in enumerate(clips)
    ]
    clip_repo.create_many(new_clips)

    project.mark_uploading()
    project_repo.update(project)

    return [
        ClipUploadUrl(
            clip_id=clip.id,
            clip_index=clip.clip_index,
            upload_url=generate_signed_upload_url(
                _object_key(clip),
                content_type=clip.content_type,
                expires_in_seconds=UPLOAD_URL_EXPIRES_IN_SECONDS,
            ),
        )
        for clip in new_clips
    ]


def _object_key(clip: Clip) -> str:
    ext = ""
    if "." in clip.original_filename:
        ext = "." + clip.original_filename.rsplit(".", 1)[1].lower()
    return f"original/{clip.project_id}/{clip.id}{ext}"

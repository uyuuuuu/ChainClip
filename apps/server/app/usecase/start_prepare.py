from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.domain.clip import ClipStatus
from app.domain.error import InvalidProjectStateError, ProjectNotFoundError
from app.domain.project import ProjectStatus
from app.infra.db.repository import ClipRepo, ProjectRepo


@dataclass
class PrepareResult:
    project_id: uuid.UUID
    status: str


def start_prepare(
    project_repo: ProjectRepo,
    clip_repo: ClipRepo,
    *,
    project_id: uuid.UUID,
    access_token: str,
) -> PrepareResult:
    """POST /projects/{projectId}/prepare: 全clipがuploadedならprepare worker起動、project.status=preparing。"""
    project = project_repo.get_by_id(project_id)
    if project is None:
        raise ProjectNotFoundError(f"project not found: {project_id}")

    project.verify_access(access_token)
    project.assert_status(ProjectStatus.UPLOADED)

    clips = clip_repo.list_by_project_id(project_id)
    if not clips or any(clip.status != ClipStatus.UPLOADED for clip in clips):
        raise InvalidProjectStateError("all clips must be uploaded before prepare")

    project.mark_preparing()
    project_repo.update(project)

    # TODO: Cloud Run Jobsのprepareジョブをここでトリガーする(Job未デプロイのため後で接続)

    return PrepareResult(project_id=project.id, status=project.status.value)

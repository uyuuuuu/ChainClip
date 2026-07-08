from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from app.domain.error import ProjectNotFoundError
from app.domain.project import ProjectStatus
from app.infra.db.repository import ProjectRepo
from app.infra.worker.cloud_run import trigger_render_job


@dataclass
class RenderResult:
    project_id: uuid.UUID
    status: str


def start_render(
    project_repo: ProjectRepo,
    *,
    project_id: uuid.UUID,
    access_token: str,
    title: str | None,
    description: str | None,
    edit_config: dict[str, Any],
) -> RenderResult:
    """POST /projects/{projectId}/render: edit_configを保存しrender worker起動、project.status=rendering。"""
    project = project_repo.get_by_id(project_id)
    if project is None:
        raise ProjectNotFoundError(f"project not found: {project_id}")

    project.verify_access(access_token)
    project.assert_status(ProjectStatus.READY)

    project.mark_rendering(title=title, description=description, edit_config=edit_config)
    project_repo.update(project)

    trigger_render_job(project.id)

    return RenderResult(project_id=project.id, status=project.status.value)

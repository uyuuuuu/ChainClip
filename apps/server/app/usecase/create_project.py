from __future__ import annotations

import uuid

from app.domain.project import Project
from app.infra.db.repository import ProjectRepo


def create_project(project_repo: ProjectRepo, *, device_id: uuid.UUID) -> Project:
    """POST /projects: project作成、status=draft、access_token返却。"""
    project = Project.create(device_id=device_id)
    return project_repo.create(project)

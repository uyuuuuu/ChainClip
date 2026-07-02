from __future__ import annotations

import uuid

from app.domain.project import ProjectStatus
from app.usecase.create_project import create_project
from tests.fakes import FakeProjectRepo


def test_create_project_returns_draft_with_access_token() -> None:
    """projectを新規作成すると、status=draftでaccess_token付きのprojectがDBに保存される。"""
    project_repo = FakeProjectRepo()
    device_id = uuid.uuid4()

    project = create_project(project_repo, device_id=device_id)

    assert project.device_id == device_id
    assert project.status == ProjectStatus.DRAFT
    assert project.access_token
    assert project_repo.get_by_id(project.id) is not None

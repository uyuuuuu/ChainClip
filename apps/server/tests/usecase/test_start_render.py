from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest

from app.domain.error import AccessDeniedError, InvalidProjectStateError, ProjectNotFoundError
from app.domain.project import Project, ProjectStatus
from app.usecase.start_render import start_render
from tests.fakes import FakeProjectRepo

EDIT_CONFIG = {
    "version": 1,
    "output": {"aspectRatio": "9:16", "width": 1080, "height": 1920, "fps": 30},
    "timeline": [
        {
            "cutId": "client-uuid",
            "order": 0,
            "clipId": str(uuid.uuid4()),
            "startMs": 1000,
            "endMs": 3500,
            "transform": {"zoom": 1.4, "offsetX": 0.1, "offsetY": -0.05},
            "transitionToNext": {"type": "fade", "durationMs": 400},
        }
    ],
}


def _ready_project(project_repo: FakeProjectRepo) -> Project:
    project = Project.create(device_id=uuid.uuid4())
    project.mark_uploading()
    project.mark_uploaded()
    project.mark_preparing()
    project.mark_ready()
    project_repo.create(project)
    return project


@patch("app.usecase.start_render.trigger_render_job")
def test_start_render_marks_rendering_and_triggers_job(mock_trigger) -> None:
    """readyなprojectはeditConfigを保存し、statusがrenderingになりrender workerが起動される。"""
    project_repo = FakeProjectRepo()
    project = _ready_project(project_repo)

    result = start_render(
        project_repo,
        project_id=project.id,
        access_token=project.access_token,
        title="旅行の思い出",
        description="2026年夏の旅行動画",
        edit_config=EDIT_CONFIG,
    )

    assert result.status == ProjectStatus.RENDERING.value
    stored = project_repo.get_by_id(project.id)
    assert stored.status == ProjectStatus.RENDERING
    assert stored.title == "旅行の思い出"
    assert stored.description == "2026年夏の旅行動画"
    assert stored.edit_config == EDIT_CONFIG
    mock_trigger.assert_called_once_with(project.id)


@patch("app.usecase.start_render.trigger_render_job")
def test_start_render_raises_when_project_not_ready(mock_trigger) -> None:
    """project.statusがready以外(draftのまま)だとInvalidProjectStateErrorになる。"""
    project_repo = FakeProjectRepo()
    project = project_repo.create(Project.create(device_id=uuid.uuid4()))

    with pytest.raises(InvalidProjectStateError):
        start_render(
            project_repo,
            project_id=project.id,
            access_token=project.access_token,
            title=None,
            description=None,
            edit_config=EDIT_CONFIG,
        )

    mock_trigger.assert_not_called()


@patch("app.usecase.start_render.trigger_render_job")
def test_start_render_raises_when_access_token_mismatch(mock_trigger) -> None:
    """access_tokenが一致しない場合はAccessDeniedErrorになり、workerは起動しない。"""
    project_repo = FakeProjectRepo()
    project = _ready_project(project_repo)

    with pytest.raises(AccessDeniedError):
        start_render(
            project_repo,
            project_id=project.id,
            access_token="wrong-token",
            title=None,
            description=None,
            edit_config=EDIT_CONFIG,
        )

    mock_trigger.assert_not_called()


def test_start_render_raises_when_project_not_found() -> None:
    """存在しないproject_idを指定するとProjectNotFoundErrorになる。"""
    project_repo = FakeProjectRepo()

    with pytest.raises(ProjectNotFoundError):
        start_render(
            project_repo,
            project_id=uuid.uuid4(),
            access_token="x",
            title=None,
            description=None,
            edit_config=EDIT_CONFIG,
        )

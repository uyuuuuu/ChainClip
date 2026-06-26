from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest

from app.domain.clip import Clip
from app.domain.error import AccessDeniedError, InvalidProjectStateError, ProjectNotFoundError
from app.domain.project import Project, ProjectStatus
from app.usecase.start_prepare import start_prepare
from tests.fakes import FakeClipRepo, FakeProjectRepo


def _uploaded_project_with_one_clip(
    project_repo: FakeProjectRepo, clip_repo: FakeClipRepo
) -> Project:
    project = Project.create(device_id=uuid.uuid4())
    project.mark_uploading()
    project.mark_uploaded()
    project_repo.create(project)

    clip = Clip.create(
        project_id=project.id,
        clip_index=0,
        original_filename="a.mp4",
        content_type="video/mp4",
        size_bytes=100,
    )
    clip.mark_uploaded()
    clip_repo.create_many([clip])
    return project


@patch("app.usecase.start_prepare.trigger_prepare_job")
def test_start_prepare_marks_preparing_and_triggers_job(mock_trigger) -> None:
    """全clipがuploaded済みなら、project.statusがpreparingになりprepare workerが起動される。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    project = _uploaded_project_with_one_clip(project_repo, clip_repo)

    result = start_prepare(
        project_repo, clip_repo, project_id=project.id, access_token=project.access_token
    )

    assert result.status == ProjectStatus.PREPARING.value
    assert project_repo.get_by_id(project.id).status == ProjectStatus.PREPARING
    mock_trigger.assert_called_once_with(project.id)


@patch("app.usecase.start_prepare.trigger_prepare_job")
def test_start_prepare_raises_when_not_all_clips_uploaded(mock_trigger) -> None:
    """2clip中1つがまだuploaded出来ていない場合はInvalidProjectStateErrorになり、workerも起動しない。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    project = Project.create(device_id=uuid.uuid4())
    project.mark_uploading()
    project.mark_uploaded()
    project_repo.create(project)

    uploaded_clip = Clip.create(
        project_id=project.id, clip_index=0, original_filename="a.mp4", content_type="video/mp4", size_bytes=1
    )
    uploaded_clip.mark_uploaded()
    pending_clip = Clip.create(
        project_id=project.id, clip_index=1, original_filename="b.mp4", content_type="video/mp4", size_bytes=1
    )
    clip_repo.create_many([uploaded_clip, pending_clip])

    with pytest.raises(InvalidProjectStateError):
        start_prepare(project_repo, clip_repo, project_id=project.id, access_token=project.access_token)

    mock_trigger.assert_not_called()


@patch("app.usecase.start_prepare.trigger_prepare_job")
def test_start_prepare_raises_when_project_not_uploaded(mock_trigger) -> None:
    """project.statusがuploaded以外(draftのまま)だとInvalidProjectStateErrorになる。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    project = project_repo.create(Project.create(device_id=uuid.uuid4()))

    with pytest.raises(InvalidProjectStateError):
        start_prepare(project_repo, clip_repo, project_id=project.id, access_token=project.access_token)

    mock_trigger.assert_not_called()


@patch("app.usecase.start_prepare.trigger_prepare_job")
def test_start_prepare_raises_when_access_token_mismatch(mock_trigger) -> None:
    """access_tokenが一致しない場合はAccessDeniedErrorになり、workerは起動しない。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    project = _uploaded_project_with_one_clip(project_repo, clip_repo)

    with pytest.raises(AccessDeniedError):
        start_prepare(project_repo, clip_repo, project_id=project.id, access_token="wrong-token")

    mock_trigger.assert_not_called()


def test_start_prepare_raises_when_project_not_found() -> None:
    """存在しないproject_idを指定するとProjectNotFoundErrorになる。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()

    with pytest.raises(ProjectNotFoundError):
        start_prepare(project_repo, clip_repo, project_id=uuid.uuid4(), access_token="x")

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest

from app.domain.clip import Clip, ClipStatus
from app.domain.error import AccessDeniedError, GcsObjectNotFoundError, InvalidClipError
from app.domain.project import Project, ProjectStatus
from app.usecase.complete_upload import complete_upload
from tests.fakes import FakeClipRepo, FakeProjectRepo


def _setup_project_with_clips(
    project_repo: FakeProjectRepo, clip_repo: FakeClipRepo, *, clip_count: int = 1
) -> tuple[Project, list[Clip]]:
    project = project_repo.create(Project.create(device_id=uuid.uuid4()))
    clips = [
        Clip.create(
            project_id=project.id,
            clip_index=i,
            original_filename=f"clip{i}.mp4",
            content_type="video/mp4",
            size_bytes=100,
        )
        for i in range(clip_count)
    ]
    clip_repo.create_many(clips)
    return project, clips


@patch("app.usecase.complete_upload.gcs.object_exists", return_value=True)
def test_complete_upload_marks_clip_and_project_uploaded_when_single_clip(mock_exists) -> None:
    """clipが1つだけのprojectで完了通知すると、clipだけでなくprojectもuploaded状態になる。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    project, clips = _setup_project_with_clips(project_repo, clip_repo)

    result = complete_upload(
        project_repo, clip_repo, clip_id=clips[0].id, access_token=project.access_token
    )

    assert result.status == ClipStatus.UPLOADED.value
    assert project_repo.get_by_id(project.id).status == ProjectStatus.UPLOADED


@patch("app.usecase.complete_upload.gcs.object_exists", return_value=True)
def test_complete_upload_keeps_project_status_until_all_clips_done(mock_exists) -> None:
    """2clip中1つだけ完了通知した時点では、project.statusはdraftのまま変わらない。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    project, clips = _setup_project_with_clips(project_repo, clip_repo, clip_count=2)

    complete_upload(project_repo, clip_repo, clip_id=clips[0].id, access_token=project.access_token)

    assert project_repo.get_by_id(project.id).status == ProjectStatus.DRAFT
    assert clip_repo.get_by_id(clips[1].id).status == ClipStatus.UPLOADING


@patch("app.usecase.complete_upload.gcs.object_exists", return_value=False)
def test_complete_upload_raises_when_gcs_object_missing(mock_exists) -> None:
    """GCS上に実体ファイルが無い場合はGcsObjectNotFoundErrorになり、uploaded扱いにしない。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    project, clips = _setup_project_with_clips(project_repo, clip_repo)

    with pytest.raises(GcsObjectNotFoundError):
        complete_upload(project_repo, clip_repo, clip_id=clips[0].id, access_token=project.access_token)


def test_complete_upload_raises_when_clip_not_found() -> None:
    """存在しないclip_idを指定するとInvalidClipErrorになる。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()

    with pytest.raises(InvalidClipError):
        complete_upload(project_repo, clip_repo, clip_id=uuid.uuid4(), access_token="x")


@patch("app.usecase.complete_upload.gcs.object_exists", return_value=True)
def test_complete_upload_raises_when_access_token_mismatch(mock_exists) -> None:
    """access_tokenが一致しない場合はAccessDeniedErrorになり、GCS確認すら行わない。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    project, clips = _setup_project_with_clips(project_repo, clip_repo)

    with pytest.raises(AccessDeniedError):
        complete_upload(project_repo, clip_repo, clip_id=clips[0].id, access_token="wrong-token")

    mock_exists.assert_not_called()

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest

from app.domain.clip import ClipStatus
from app.domain.error import AccessDeniedError, InvalidClipError, ProjectNotFoundError
from app.domain.project import Project, ProjectStatus
from app.usecase.request_upload_urls import ClipUploadRequestItem, request_upload_urls
from tests.fakes import FakeClipRepo, FakeProjectRepo


def _create_draft_project(project_repo: FakeProjectRepo) -> Project:
    return project_repo.create(Project.create(device_id=uuid.uuid4()))


@patch(
    "app.usecase.request_upload_urls.generate_signed_upload_url",
    return_value="https://signed.example/upload",
)
def test_request_upload_urls_creates_clips_and_marks_uploading(mock_sign) -> None:
    """動画ファイルなら、clipが作成されsigned URLが発行され、project/clipがuploading状態になる。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    project = _create_draft_project(project_repo)

    results = request_upload_urls(
        project_repo,
        clip_repo,
        project_id=project.id,
        access_token=project.access_token,
        clips=[ClipUploadRequestItem(original_filename="a.mp4", content_type="video/mp4", size_bytes=100)],
    )

    assert len(results) == 1
    assert results[0].upload_url == "https://signed.example/upload"
    assert project_repo.get_by_id(project.id).status == ProjectStatus.UPLOADING
    clips = clip_repo.list_by_project_id(project.id)
    assert clips[0].status == ClipStatus.UPLOADING


def test_request_upload_urls_rejects_non_video_content_type() -> None:
    """content_typeがvideo/で始まらないファイルはInvalidClipErrorで拒否される。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    project = _create_draft_project(project_repo)

    with pytest.raises(InvalidClipError):
        request_upload_urls(
            project_repo,
            clip_repo,
            project_id=project.id,
            access_token=project.access_token,
            clips=[ClipUploadRequestItem(original_filename="a.txt", content_type="text/plain", size_bytes=10)],
        )


def test_request_upload_urls_raises_when_access_token_mismatch() -> None:
    """access_tokenが一致しない場合はAccessDeniedErrorになり、clipは作られない。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    project = _create_draft_project(project_repo)

    with pytest.raises(AccessDeniedError):
        request_upload_urls(
            project_repo,
            clip_repo,
            project_id=project.id,
            access_token="wrong-token",
            clips=[],
        )


def test_request_upload_urls_raises_when_project_not_found() -> None:
    """存在しないproject_idを指定するとProjectNotFoundErrorになる。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()

    with pytest.raises(ProjectNotFoundError):
        request_upload_urls(
            project_repo,
            clip_repo,
            project_id=uuid.uuid4(),
            access_token="x",
            clips=[],
        )

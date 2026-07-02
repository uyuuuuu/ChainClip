from __future__ import annotations

import uuid

import pytest

from app.domain.asset import AssetKind, ProjectAsset, StorageProvider
from app.domain.error import ProjectNotFoundError
from app.domain.project import Project
from app.usecase.get_share_page import get_share_page
from tests.fakes import FakeAssetRepo, FakeProjectRepo


def _create_completed_project(project_repo: FakeProjectRepo, asset_repo: FakeAssetRepo) -> Project:
    project = Project.create(device_id=uuid.uuid4())
    project.title = "旅行の思い出"
    project.description = "沖縄旅行のハイライト"
    project.mark_uploading()
    project.mark_uploaded()
    project.mark_preparing()
    project.mark_ready()
    project.mark_completed()
    project_repo.create(project)

    asset_repo.create(
        ProjectAsset.create(
            project_id=project.id,
            kind=AssetKind.FINAL_CLIP,
            storage_provider=StorageProvider.R2,
            bucket="chainclip-final",
            object_key=f"final/{project.id}.mp4",
            public_url="https://cdn.example.com/final/x.mp4",
        )
    )
    return project


def test_get_share_page_returns_video_url_when_completed() -> None:
    """completed状態のprojectはタイトル・説明・完成動画URLを返す。"""
    project_repo = FakeProjectRepo()
    asset_repo = FakeAssetRepo()
    project = _create_completed_project(project_repo, asset_repo)

    result = get_share_page(project_repo, asset_repo, share_slug=project.share_slug)

    assert result.project_id == project.id
    assert result.title == "旅行の思い出"
    assert result.description == "沖縄旅行のハイライト"
    assert result.video_url == "https://cdn.example.com/final/x.mp4"


def test_get_share_page_raises_when_share_slug_not_found() -> None:
    """存在しないshare_slugを指定するとProjectNotFoundErrorになる。"""
    project_repo = FakeProjectRepo()
    asset_repo = FakeAssetRepo()

    with pytest.raises(ProjectNotFoundError):
        get_share_page(project_repo, asset_repo, share_slug="unknown-slug")


def test_get_share_page_raises_when_project_not_completed() -> None:
    """completedでないprojectのshare_slugを指定してもProjectNotFoundErrorになる(未完成情報を漏らさない)。"""
    project_repo = FakeProjectRepo()
    asset_repo = FakeAssetRepo()
    project = Project.create(device_id=uuid.uuid4())
    project.share_slug = "in-progress-slug"
    project_repo.create(project)

    with pytest.raises(ProjectNotFoundError):
        get_share_page(project_repo, asset_repo, share_slug="in-progress-slug")

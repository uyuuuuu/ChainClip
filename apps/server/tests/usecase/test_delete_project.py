from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest

from app.domain.asset import AssetKind, ProjectAsset, StorageProvider
from app.domain.error import AccessDeniedError, ProjectNotFoundError, StorageDeleteError
from app.domain.project import Project
from app.usecase.delete_project import delete_project
from tests.fakes import FakeAssetRepo, FakeProjectRepo


def _completed_project(project_repo: FakeProjectRepo, asset_repo: FakeAssetRepo) -> Project:
    """render済みで、R2に完成動画assetを持つprojectを用意する。"""
    project = Project.create(device_id=uuid.uuid4())
    project.mark_uploading()
    project.mark_uploaded()
    project.mark_preparing()
    project.mark_ready()
    project.mark_rendering(title="t", description="d", edit_config={"version": 1})
    project.mark_completed()
    project_repo.create(project)

    asset_repo.create(
        ProjectAsset.create(
            project_id=project.id,
            kind=AssetKind.FINAL_CLIP,
            storage_provider=StorageProvider.R2,
            bucket="bucket",
            object_key=project.final_object_key(),
            public_url="https://cdn.example.com/final.mp4",
            content_type="video/mp4",
        )
    )
    return project


@patch("app.usecase.delete_project.gcs.delete_prefix")
@patch("app.usecase.delete_project.r2.delete_object")
def test_delete_project_removes_r2_object_gcs_files_and_db_row(mock_r2, mock_gcs) -> None:
    """completedなprojectを削除すると、R2の完成動画・GCSの中間ファイル・DB行が全て消える。"""
    project_repo = FakeProjectRepo()
    asset_repo = FakeAssetRepo()
    project = _completed_project(project_repo, asset_repo)

    delete_project(
        project_repo, asset_repo, project_id=project.id, access_token=project.access_token
    )

    mock_r2.assert_called_once_with(project.final_object_key())
    assert [call.args[0] for call in mock_gcs.call_args_list] == [
        f"original/{project.id}/",
        f"converted/{project.id}/",
        f"scenes/{project.id}/",
    ]
    assert project_repo.get_by_id(project.id) is None


@patch("app.usecase.delete_project.gcs.delete_prefix")
@patch("app.usecase.delete_project.r2.delete_object")
def test_delete_project_deletes_project_stuck_in_preparing(mock_r2, mock_gcs) -> None:
    """アプリが落ちてpreparingのまま止まったprojectも、R2 assetが無いまま削除できる。"""
    project_repo = FakeProjectRepo()
    asset_repo = FakeAssetRepo()
    project = Project.create(device_id=uuid.uuid4())
    project.mark_uploading()
    project.mark_uploaded()
    project.mark_preparing()
    project_repo.create(project)

    delete_project(
        project_repo, asset_repo, project_id=project.id, access_token=project.access_token
    )

    # 完成動画がまだ存在しないためR2は触らないが、GCSの中間ファイルは消す。
    mock_r2.assert_not_called()
    assert mock_gcs.call_count == 3
    assert project_repo.get_by_id(project.id) is None


@patch("app.usecase.delete_project.gcs.delete_prefix")
@patch("app.usecase.delete_project.r2.delete_object")
def test_delete_project_deletes_failed_project(mock_r2, mock_gcs) -> None:
    """処理に失敗してfailedになったprojectも削除できる。"""
    project_repo = FakeProjectRepo()
    asset_repo = FakeAssetRepo()
    project = Project.create(device_id=uuid.uuid4())
    project.mark_failed(
        error_phase="prepare", error_code="FFMPEG_FAILED", error_message="conversion failed"
    )
    project_repo.create(project)

    delete_project(
        project_repo, asset_repo, project_id=project.id, access_token=project.access_token
    )

    assert mock_gcs.call_count == 3
    assert project_repo.get_by_id(project.id) is None


@patch("app.usecase.delete_project.gcs.delete_prefix")
@patch("app.usecase.delete_project.r2.delete_object")
def test_delete_project_keeps_db_row_when_storage_delete_fails(mock_r2, mock_gcs) -> None:
    """通信エラー等でストレージ削除に失敗した場合、リトライできるようDB行を残す。"""
    project_repo = FakeProjectRepo()
    asset_repo = FakeAssetRepo()
    project = _completed_project(project_repo, asset_repo)
    mock_r2.side_effect = StorageDeleteError("connection reset")

    with pytest.raises(StorageDeleteError):
        delete_project(
            project_repo, asset_repo, project_id=project.id, access_token=project.access_token
        )

    assert project_repo.get_by_id(project.id) is not None


@patch("app.usecase.delete_project.gcs.delete_prefix")
@patch("app.usecase.delete_project.r2.delete_object")
def test_delete_project_raises_when_access_token_mismatch(mock_r2, mock_gcs) -> None:
    """access_tokenが一致しない場合はAccessDeniedErrorになり、ファイルもDB行も消えない。"""
    project_repo = FakeProjectRepo()
    asset_repo = FakeAssetRepo()
    project = _completed_project(project_repo, asset_repo)

    with pytest.raises(AccessDeniedError):
        delete_project(project_repo, asset_repo, project_id=project.id, access_token="wrong-token")

    mock_r2.assert_not_called()
    mock_gcs.assert_not_called()
    assert project_repo.get_by_id(project.id) is not None


def test_delete_project_raises_when_project_not_found() -> None:
    """存在しないproject_idを指定するとProjectNotFoundErrorになる。"""
    project_repo = FakeProjectRepo()
    asset_repo = FakeAssetRepo()

    with pytest.raises(ProjectNotFoundError):
        delete_project(project_repo, asset_repo, project_id=uuid.uuid4(), access_token="x")

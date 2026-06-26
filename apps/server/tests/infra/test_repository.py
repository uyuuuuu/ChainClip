from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.domain.asset import AssetKind, ProjectAsset, StorageProvider
from app.domain.clip import Clip, ClipStatus
from app.domain.job import JobStatus, JobType, ProcessingJob
from app.domain.project import Project, ProjectStatus
from app.infra.db.models import ProjectModel
from app.infra.db.repository import AssetRepo, ClipRepo, ProcessingJobRepo, ProjectRepo


def test_project_repo_create_and_get_by_id(session: Session) -> None:
    """createしたprojectをget_by_idで取得すると、実DBに保存された値が読み込める。"""
    repo = ProjectRepo(session)
    project = repo.create(Project.create(device_id=uuid.uuid4()))

    fetched = repo.get_by_id(project.id)

    assert fetched is not None
    assert fetched.status == ProjectStatus.DRAFT
    assert fetched.access_token == project.access_token


def test_project_repo_update_persists_status_and_error_fields(session: Session) -> None:
    """status/error_phase/error_code/error_messageの更新がPostgresのネイティブENUM/Text列に正しく反映される。"""
    repo = ProjectRepo(session)
    project = repo.create(Project.create(device_id=uuid.uuid4()))

    project.mark_failed(error_phase="prepare", error_code="FFMPEG_FAILED", error_message="boom")
    repo.update(project)

    fetched = repo.get_by_id(project.id)
    assert fetched is not None
    assert fetched.status == ProjectStatus.FAILED
    assert fetched.error_phase == "prepare"
    assert fetched.error_code == "FFMPEG_FAILED"
    assert fetched.error_message == "boom"


def test_clip_repo_create_many_and_list_by_project_id(session: Session) -> None:
    """複数clipを一括作成すると、list_by_project_idがclip_index昇順で返す。"""
    project_repo = ProjectRepo(session)
    clip_repo = ClipRepo(session)
    project = project_repo.create(Project.create(device_id=uuid.uuid4()))

    clip_repo.create_many(
        [
            Clip.create(
                project_id=project.id,
                clip_index=i,
                original_filename=f"clip{i}.mp4",
                content_type="video/mp4",
                size_bytes=10,
            )
            for i in range(2)
        ]
    )

    fetched = clip_repo.list_by_project_id(project.id)
    assert [c.clip_index for c in fetched] == [0, 1]


def test_clip_repo_update_persists_status_and_duration(session: Session) -> None:
    """mark_readyで設定したstatus/duration_msがDBに保存され、再取得後も保持されている。"""
    project_repo = ProjectRepo(session)
    clip_repo = ClipRepo(session)
    project = project_repo.create(Project.create(device_id=uuid.uuid4()))
    clip = clip_repo.create_many(
        [
            Clip.create(
                project_id=project.id,
                clip_index=0,
                original_filename="a.mp4",
                content_type="video/mp4",
                size_bytes=10,
            )
        ]
    )[0]

    clip.mark_ready(duration_ms=1234, width=1080, height=1920)
    clip_repo.update(clip)

    fetched = clip_repo.get_by_id(clip.id)
    assert fetched is not None
    assert fetched.status == ClipStatus.READY
    assert fetched.duration_ms == 1234
    assert fetched.width == 1080
    assert fetched.height == 1920


def test_asset_repo_create(session: Session) -> None:
    """project_assetsへの作成が成功し、created_atがDBのserver_defaultで自動設定される。"""
    project_repo = ProjectRepo(session)
    asset_repo = AssetRepo(session)
    project = project_repo.create(Project.create(device_id=uuid.uuid4()))

    asset = asset_repo.create(
        ProjectAsset.create(
            project_id=project.id,
            kind=AssetKind.CONVERTED_CLIP,
            storage_provider=StorageProvider.GCS,
            bucket="test-bucket",
            object_key="converted/x.mp4",
        )
    )

    assert asset.created_at is not None


def test_asset_repo_list_by_project_id(session: Session) -> None:
    """同じclipに紐づくconverted_clip/scene_candidatesの2つのassetを両方取得できる。"""
    project_repo = ProjectRepo(session)
    clip_repo = ClipRepo(session)
    asset_repo = AssetRepo(session)
    project = project_repo.create(Project.create(device_id=uuid.uuid4()))
    clip = clip_repo.create_many(
        [
            Clip.create(
                project_id=project.id,
                clip_index=0,
                original_filename="a.mp4",
                content_type="video/mp4",
                size_bytes=10,
            )
        ]
    )[0]

    asset_repo.create(
        ProjectAsset.create(
            project_id=project.id,
            clip_id=clip.id,
            kind=AssetKind.CONVERTED_CLIP,
            storage_provider=StorageProvider.GCS,
            bucket="test-bucket",
            object_key="converted/x.mp4",
        )
    )
    asset_repo.create(
        ProjectAsset.create(
            project_id=project.id,
            clip_id=clip.id,
            kind=AssetKind.SCENE_CANDIDATES,
            storage_provider=StorageProvider.GCS,
            bucket="test-bucket",
            object_key="scenes/x.json",
        )
    )

    assets = asset_repo.list_by_project_id(project.id)
    assert {asset.kind for asset in assets} == {AssetKind.CONVERTED_CLIP, AssetKind.SCENE_CANDIDATES}


def test_processing_job_repo_create_and_update(session: Session) -> None:
    """jobをqueuedで作成後、mark_succeeded+updateでsucceededに遷移できる。"""
    project_repo = ProjectRepo(session)
    job_repo = ProcessingJobRepo(session)
    project = project_repo.create(Project.create(device_id=uuid.uuid4()))

    job = job_repo.create(ProcessingJob.create(project_id=project.id, job_type=JobType.FULL_PIPELINE))
    assert job.status == JobStatus.QUEUED

    job.mark_succeeded(finished_at=datetime.now(timezone.utc))
    job_repo.update(job)

    assert job.status == JobStatus.SUCCEEDED


def test_project_repo_update_raises_when_not_found(session: Session) -> None:
    """DBに存在しないprojectをupdateしようとするとValueErrorになる。"""
    repo = ProjectRepo(session)
    project = Project.create(device_id=uuid.uuid4())

    with pytest.raises(ValueError):
        repo.update(project)


def test_clip_repo_update_raises_when_not_found(session: Session) -> None:
    """DBに存在しないclipをupdateしようとするとValueErrorになる。"""
    repo = ClipRepo(session)
    clip = Clip.create(
        project_id=uuid.uuid4(),
        clip_index=0,
        original_filename="a.mp4",
        content_type="video/mp4",
        size_bytes=10,
    )

    with pytest.raises(ValueError):
        repo.update(clip)


def test_clip_repo_get_by_id_returns_none_when_not_found(session: Session) -> None:
    """存在しないclip_idを渡すとNoneが返る(例外にならない)。"""
    repo = ClipRepo(session)

    assert repo.get_by_id(uuid.uuid4()) is None


def test_deleting_project_cascades_to_clips_and_assets(session: Session) -> None:
    """projectを削除すると、外部キーのON DELETE CASCADEにより紐づくclip/assetも自動で削除される。"""
    project_repo = ProjectRepo(session)
    clip_repo = ClipRepo(session)
    asset_repo = AssetRepo(session)
    project = project_repo.create(Project.create(device_id=uuid.uuid4()))
    clip = clip_repo.create_many(
        [
            Clip.create(
                project_id=project.id,
                clip_index=0,
                original_filename="a.mp4",
                content_type="video/mp4",
                size_bytes=10,
            )
        ]
    )[0]
    asset_repo.create(
        ProjectAsset.create(
            project_id=project.id,
            clip_id=clip.id,
            kind=AssetKind.CONVERTED_CLIP,
            storage_provider=StorageProvider.GCS,
            bucket="test-bucket",
            object_key="converted/x.mp4",
        )
    )

    session.execute(delete(ProjectModel).where(ProjectModel.id == project.id))
    session.commit()

    assert clip_repo.get_by_id(clip.id) is None

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest

from app.domain.asset import AssetKind, ProjectAsset, StorageProvider
from app.domain.clip import Clip
from app.domain.error import AccessDeniedError, ProjectNotFoundError
from app.domain.project import Project, ProjectStatus
from app.usecase.get_project_status import get_project_status
from tests.fakes import FakeAssetRepo, FakeClipRepo, FakeProjectRepo


def test_get_project_status_returns_basic_status_for_draft() -> None:
    """draft状態ではprojectId/statusのみを返し、進捗・解析結果は含まない。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    asset_repo = FakeAssetRepo()
    project = project_repo.create(Project.create(device_id=uuid.uuid4()))

    result = get_project_status(
        project_repo, clip_repo, asset_repo, project_id=project.id, access_token=project.access_token
    )

    assert result.status == ProjectStatus.DRAFT.value
    assert result.clips_total is None
    assert result.clips is None


def test_get_project_status_returns_clips_progress_when_preparing() -> None:
    """preparing状態では全clip数とready済みclip数を返す。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    asset_repo = FakeAssetRepo()
    project = Project.create(device_id=uuid.uuid4())
    project.mark_uploading()
    project.mark_uploaded()
    project.mark_preparing()
    project_repo.create(project)

    ready_clip = Clip.create(
        project_id=project.id, clip_index=0, original_filename="a.mp4", content_type="video/mp4", size_bytes=1
    )
    ready_clip.mark_ready(duration_ms=1000, width=1080, height=1920)
    pending_clip = Clip.create(
        project_id=project.id, clip_index=1, original_filename="b.mp4", content_type="video/mp4", size_bytes=1
    )
    clip_repo.create_many([ready_clip, pending_clip])

    result = get_project_status(
        project_repo, clip_repo, asset_repo, project_id=project.id, access_token=project.access_token
    )

    assert result.clips_total == 2
    assert result.clips_ready == 1


@patch(
    "app.usecase.get_project_status.gcs.read_json",
    return_value={"scenes": [{"startMs": 0, "endMs": 1000, "labels": ["dummy"]}]},
)
@patch(
    "app.usecase.get_project_status.gcs.generate_signed_download_url",
    return_value="https://signed.example/video.mp4",
)
def test_get_project_status_returns_clip_video_and_scenes_when_ready(mock_url, mock_scenes) -> None:
    """ready状態では各clipのsigned URL・幅高さ・シーン一覧を返す。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    asset_repo = FakeAssetRepo()
    project = Project.create(device_id=uuid.uuid4())
    project.mark_uploading()
    project.mark_uploaded()
    project.mark_preparing()
    project.mark_ready()
    project_repo.create(project)

    clip = Clip.create(
        project_id=project.id, clip_index=0, original_filename="a.mp4", content_type="video/mp4", size_bytes=1
    )
    clip.mark_ready(duration_ms=5000, width=1080, height=1920)
    clip_repo.create_many([clip])

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

    result = get_project_status(
        project_repo, clip_repo, asset_repo, project_id=project.id, access_token=project.access_token
    )

    assert result.clips is not None
    assert len(result.clips) == 1
    ready_clip = result.clips[0]
    assert ready_clip.video.url == "https://signed.example/video.mp4"
    assert ready_clip.width == 1080
    assert ready_clip.height == 1920
    assert ready_clip.duration_ms == 5000
    assert ready_clip.scenes[0].start_ms == 0
    assert ready_clip.scenes[0].end_ms == 1000


def test_get_project_status_returns_share_url_and_video_url_when_completed(monkeypatch) -> None:
    """completed状態ではshare_slugから組み立てたshare_urlと完成動画のfinal_video_url、
    renderingで保存したtitle/descriptionを返す。"""
    monkeypatch.setenv("WEB_BASE_URL", "https://chainclip.example.com")
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    asset_repo = FakeAssetRepo()
    project = Project.create(device_id=uuid.uuid4())
    project.mark_uploading()
    project.mark_uploaded()
    project.mark_preparing()
    project.mark_ready()
    project.mark_rendering(title="夏の思い出", description="海に行ったときの動画", edit_config={})
    project.mark_completed()
    project_repo.create(project)

    asset_repo.create(
        ProjectAsset.create(
            project_id=project.id,
            kind=AssetKind.FINAL_CLIP,
            storage_provider=StorageProvider.R2,
            bucket="test-bucket",
            object_key="final/x.mp4",
            public_url="https://videos.example.com/final/x.mp4",
        )
    )

    result = get_project_status(
        project_repo, clip_repo, asset_repo, project_id=project.id, access_token=project.access_token
    )

    assert result.share_url == f"https://chainclip.example.com/s/{project.share_slug}"
    assert result.final_video_url == "https://videos.example.com/final/x.mp4"
    assert result.title == "夏の思い出"
    assert result.description == "海に行ったときの動画"


def test_get_project_status_returns_error_info_when_failed() -> None:
    """failed状態ではerror_phase/error_code/error_messageを返す。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    asset_repo = FakeAssetRepo()
    project = project_repo.create(Project.create(device_id=uuid.uuid4()))
    project.mark_failed(error_phase="prepare", error_code="FFMPEG_FAILED", error_message="boom")
    project_repo.update(project)

    result = get_project_status(
        project_repo, clip_repo, asset_repo, project_id=project.id, access_token=project.access_token
    )

    assert result.error_phase == "prepare"
    assert result.error_code == "FFMPEG_FAILED"
    assert result.error_message == "boom"


def test_get_project_status_raises_when_access_token_mismatch() -> None:
    """access_tokenが一致しない場合はAccessDeniedErrorになる。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    asset_repo = FakeAssetRepo()
    project = project_repo.create(Project.create(device_id=uuid.uuid4()))

    with pytest.raises(AccessDeniedError):
        get_project_status(
            project_repo, clip_repo, asset_repo, project_id=project.id, access_token="wrong-token"
        )


def test_get_project_status_raises_when_project_not_found() -> None:
    """存在しないproject_idを指定するとProjectNotFoundErrorになる。"""
    project_repo = FakeProjectRepo()
    clip_repo = FakeClipRepo()
    asset_repo = FakeAssetRepo()

    with pytest.raises(ProjectNotFoundError):
        get_project_status(
            project_repo, clip_repo, asset_repo, project_id=uuid.uuid4(), access_token="x"
        )

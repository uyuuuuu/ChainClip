from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.domain.asset import AssetKind, ProjectAsset
from app.domain.clip import Clip, ClipStatus
from app.domain.error import ProjectNotFoundError
from app.domain.project import ProjectStatus
from app.infra.db.repository import AssetRepo, ClipRepo, ProjectRepo
from app.infra.storage import gcs

VIDEO_URL_EXPIRES_IN_SECONDS = 3600
WEB_BASE_URL = "WEB_BASE_URL"


@dataclass
class SceneResult:
    scene_id: uuid.UUID
    scene_index: int
    start_ms: int
    end_ms: int
    labels: list[str]


@dataclass
class ClipVideoResult:
    url: str
    expires_at: datetime


@dataclass
class ReadyClipResult:
    clip_id: uuid.UUID
    clip_index: int
    duration_ms: int
    width: int
    height: int
    video: ClipVideoResult
    scenes: list[SceneResult]


@dataclass
class ProjectStatusResult:
    project_id: uuid.UUID
    status: str
    clips_total: int | None = None
    clips_ready: int | None = None
    clips: list[ReadyClipResult] | None = None
    error_phase: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    share_url: str | None = None
    final_video_url: str | None = None


def get_project_status(
    project_repo: ProjectRepo,
    clip_repo: ClipRepo,
    asset_repo: AssetRepo,
    *,
    project_id: uuid.UUID,
    access_token: str,
) -> ProjectStatusResult:
    """GET /projects/{projectId}: project.statusに応じて進捗・解析結果・エラー情報を返す。"""
    project = project_repo.get_by_id(project_id)
    if project is None:
        raise ProjectNotFoundError(f"project not found: {project_id}")

    project.verify_access(access_token)

    if project.status == ProjectStatus.PREPARING:
        clips = clip_repo.list_by_project_id(project.id)
        clips_ready = sum(1 for clip in clips if clip.status == ClipStatus.READY)
        return ProjectStatusResult(
            project_id=project.id,
            status=project.status.value,
            clips_total=len(clips),
            clips_ready=clips_ready,
        )

    if project.status == ProjectStatus.READY:
        clips = clip_repo.list_by_project_id(project.id)
        assets = asset_repo.list_by_project_id(project.id)
        return ProjectStatusResult(
            project_id=project.id,
            status=project.status.value,
            clips=[_build_ready_clip(clip, assets) for clip in clips],
        )

    if project.status == ProjectStatus.COMPLETED:
        assets = asset_repo.list_by_project_id(project.id)
        final_clip = next(a for a in assets if a.kind == AssetKind.FINAL_CLIP)

        assert project.share_slug is not None
        assert final_clip.public_url is not None

        web_base_url = os.environ[WEB_BASE_URL]
        return ProjectStatusResult(
            project_id=project.id,
            status=project.status.value,
            share_url=f"{web_base_url.rstrip('/')}/s/{project.share_slug}",
            final_video_url=final_clip.public_url,
        )

    if project.status == ProjectStatus.FAILED:
        return ProjectStatusResult(
            project_id=project.id,
            status=project.status.value,
            error_phase=project.error_phase,
            error_code=project.error_code,
            error_message=project.error_message,
        )

    return ProjectStatusResult(project_id=project.id, status=project.status.value)


def _build_ready_clip(clip: Clip, assets: list[ProjectAsset]) -> ReadyClipResult:
    converted = next(a for a in assets if a.clip_id == clip.id and a.kind == AssetKind.CONVERTED_CLIP)
    scene_candidates = next(
        a for a in assets if a.clip_id == clip.id and a.kind == AssetKind.SCENE_CANDIDATES
    )

    video_url = gcs.generate_signed_download_url(
        converted.object_key, expires_in_seconds=VIDEO_URL_EXPIRES_IN_SECONDS
    )
    scene_data = gcs.read_json(scene_candidates.object_key)

    assert clip.duration_ms is not None
    assert clip.width is not None
    assert clip.height is not None

    return ReadyClipResult(
        clip_id=clip.id,
        clip_index=clip.clip_index,
        duration_ms=clip.duration_ms,
        width=clip.width,
        height=clip.height,
        video=ClipVideoResult(
            url=video_url,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=VIDEO_URL_EXPIRES_IN_SECONDS),
        ),
        scenes=[
            SceneResult(
                scene_id=uuid.uuid5(clip.id, str(index)),
                scene_index=index,
                start_ms=scene["startMs"],
                end_ms=scene["endMs"],
                labels=scene["labels"],
            )
            for index, scene in enumerate(scene_data["scenes"])
        ],
    )

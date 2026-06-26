from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from app.api.dependencies import get_asset_repo, get_clip_repo, get_project_repo
from app.infra.db.repository import AssetRepo, ClipRepo, ProjectRepo
from app.usecase.create_project import create_project
from app.usecase.get_project_status import get_project_status
from app.usecase.start_prepare import start_prepare

router = APIRouter(prefix="/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)  # camelとsnake両方許容
    device_id: uuid.UUID = Field(alias="deviceId")


class CreateProjectResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    project_id: uuid.UUID = Field(alias="projectId")
    status: str
    access_token: str = Field(alias="accessToken")


@router.post("", response_model=CreateProjectResponse)
async def create_project_endpoint(
    body: CreateProjectRequest,
    project_repo: ProjectRepo = Depends(get_project_repo),
) -> CreateProjectResponse:
    """project作成、status=draft、access_token返却。"""
    project = create_project(project_repo, device_id=body.device_id)
    return CreateProjectResponse(
        project_id=project.id,
        status=project.status.value,
        access_token=project.access_token,
    )


class StartPrepareRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    access_token: str = Field(alias="accessToken")


class StartPrepareResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    project_id: uuid.UUID = Field(alias="projectId")
    status: str


@router.post("/{project_id}/prepare", response_model=StartPrepareResponse)
async def start_prepare_endpoint(
    project_id: uuid.UUID,
    body: StartPrepareRequest,
    project_repo: ProjectRepo = Depends(get_project_repo),
    clip_repo: ClipRepo = Depends(get_clip_repo),
) -> StartPrepareResponse:
    """全clipがuploadedならprepare worker起動、project.status=preparing。"""
    result = start_prepare(
        project_repo,
        clip_repo,
        project_id=project_id,
        access_token=body.access_token,
    )
    return StartPrepareResponse(project_id=result.project_id, status=result.status)


class SceneResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    scene_id: uuid.UUID = Field(alias="sceneId")
    scene_index: int = Field(alias="sceneIndex")
    start_ms: int = Field(alias="startMs")
    end_ms: int = Field(alias="endMs")
    labels: list[str]


class ClipVideoResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    url: str
    expires_at: datetime = Field(alias="expiresAt")


class ReadyClipResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    clip_id: uuid.UUID = Field(alias="clipId")
    clip_index: int = Field(alias="clipIndex")
    duration_ms: int = Field(alias="durationMs")
    width: int
    height: int
    video: ClipVideoResponse
    scenes: list[SceneResponse]


class GetProjectStatusResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    project_id: uuid.UUID = Field(alias="projectId")
    status: str
    clips_total: int | None = Field(default=None, alias="clipsTotal")
    clips_ready: int | None = Field(default=None, alias="clipsReady")
    clips: list[ReadyClipResponse] | None = None
    error_phase: str | None = Field(default=None, alias="errorPhase")
    error_code: str | None = Field(default=None, alias="errorCode")
    error_message: str | None = Field(default=None, alias="errorMessage")


@router.get("/{project_id}", response_model=GetProjectStatusResponse)
async def get_project_status_endpoint(
    project_id: uuid.UUID,
    access_token: str = Query(alias="accessToken"),
    project_repo: ProjectRepo = Depends(get_project_repo),
    clip_repo: ClipRepo = Depends(get_clip_repo),
    asset_repo: AssetRepo = Depends(get_asset_repo),
) -> GetProjectStatusResponse:
    """project.statusに応じて進捗・解析結果・エラー情報を返す。"""
    result = get_project_status(
        project_repo,
        clip_repo,
        asset_repo,
        project_id=project_id,
        access_token=access_token,
    )
    return GetProjectStatusResponse(
        project_id=result.project_id,
        status=result.status,
        clips_total=result.clips_total,
        clips_ready=result.clips_ready,
        clips=[
            ReadyClipResponse(
                clip_id=clip.clip_id,
                clip_index=clip.clip_index,
                duration_ms=clip.duration_ms,
                width=clip.width,
                height=clip.height,
                video=ClipVideoResponse(url=clip.video.url, expires_at=clip.video.expires_at),
                scenes=[
                    SceneResponse(
                        scene_id=scene.scene_id,
                        scene_index=scene.scene_index,
                        start_ms=scene.start_ms,
                        end_ms=scene.end_ms,
                        labels=scene.labels,
                    )
                    for scene in clip.scenes
                ],
            )
            for clip in result.clips
        ]
        if result.clips is not None
        else None,
        error_phase=result.error_phase,
        error_code=result.error_code,
        error_message=result.error_message,
    )

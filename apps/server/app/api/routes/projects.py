from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.api.dependencies import get_clip_repo, get_project_repo
from app.infra.db.repository import ClipRepo, ProjectRepo
from app.usecase.create_project import create_project
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

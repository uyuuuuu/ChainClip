from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.api.dependencies import get_project_repo
from app.infra.db.repository import ProjectRepo
from app.usecase.create_project import create_project

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

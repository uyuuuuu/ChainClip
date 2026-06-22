from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.api.dependencies import get_clip_repo, get_project_repo
from app.infra.db.repository import ClipRepo, ProjectRepo
from app.usecase.request_upload_urls import ClipUploadRequestItem, request_upload_urls

router = APIRouter(tags=["clips"])


class ClipUploadRequestBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    original_filename: str = Field(alias="originalFilename")
    content_type: str = Field(alias="contentType")
    size_bytes: int = Field(alias="sizeBytes")


class RequestUploadUrlsRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    access_token: str = Field(alias="accessToken")
    clips: list[ClipUploadRequestBody]


class ClipUploadUrlResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    clip_id: uuid.UUID = Field(alias="clipId")
    clip_index: int = Field(alias="clipIndex")
    upload_url: str = Field(alias="uploadUrl")


@router.post("/projects/{project_id}/clips/upload-urls", response_model=list[ClipUploadUrlResponse])
async def request_upload_urls_endpoint(
    project_id: uuid.UUID,
    body: RequestUploadUrlsRequest,
    project_repo: ProjectRepo = Depends(get_project_repo),
    clip_repo: ClipRepo = Depends(get_clip_repo),
) -> list[ClipUploadUrlResponse]:
    """動画のバリデーション、複数clip作成、GCSアップロード用signed URL発行、project.status=uploading。"""
    results = request_upload_urls(
        project_repo,
        clip_repo,
        project_id=project_id,
        access_token=body.access_token,
        clips=[
            ClipUploadRequestItem(
                original_filename=item.original_filename,
                content_type=item.content_type,
                size_bytes=item.size_bytes,
            )
            for item in body.clips
        ],
    )
    return [
        ClipUploadUrlResponse(
            clip_id=result.clip_id,
            clip_index=result.clip_index,
            upload_url=result.upload_url,
        )
        for result in results
    ]

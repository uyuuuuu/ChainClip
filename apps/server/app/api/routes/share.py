from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.api.dependencies import get_asset_repo, get_project_repo
from app.infra.db.repository import AssetRepo, ProjectRepo
from app.usecase.get_share_page import get_share_page

router = APIRouter(prefix="/share", tags=["share"])


class SharePageResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    project_id: uuid.UUID = Field(alias="projectId")
    title: str | None
    description: str | None
    video_url: str = Field(alias="videoUrl")


@router.get("/{share_slug}", response_model=SharePageResponse)
async def get_share_page_endpoint(
    share_slug: str,
    project_repo: ProjectRepo = Depends(get_project_repo),
    asset_repo: AssetRepo = Depends(get_asset_repo),
) -> SharePageResponse:
    """認証不要で完成動画の共有閲覧情報を返す。"""
    result = get_share_page(project_repo, asset_repo, share_slug=share_slug)
    return SharePageResponse(
        project_id=result.project_id,
        title=result.title,
        description=result.description,
        video_url=result.video_url,
    )

from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.domain.asset import AssetKind
from app.domain.error import ProjectNotFoundError
from app.domain.project import ProjectStatus
from app.infra.db.repository import AssetRepo, ProjectRepo


@dataclass
class SharePageResult:
    project_id: uuid.UUID
    title: str | None
    description: str | None
    video_url: str


def get_share_page(
    project_repo: ProjectRepo,
    asset_repo: AssetRepo,
    *,
    share_slug: str,
) -> SharePageResult:
    """GET /share/{shareSlug}: 認証不要で完成動画の共有閲覧情報を返す。"""
    project = project_repo.get_by_share_slug(share_slug)
    if project is None or project.status != ProjectStatus.COMPLETED:
        raise ProjectNotFoundError(f"share page not found: {share_slug}")

    assets = asset_repo.list_by_project_id(project.id)
    final_clip = next(a for a in assets if a.kind == AssetKind.FINAL_CLIP)
    assert final_clip.public_url is not None

    return SharePageResult(
        project_id=project.id,
        title=project.title,
        description=project.description,
        video_url=final_clip.public_url,
    )

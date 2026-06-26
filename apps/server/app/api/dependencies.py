from __future__ import annotations

from fastapi import Depends
from sqlalchemy.orm import Session

from app.infra.db.repository import AssetRepo, ClipRepo, ProjectRepo
from app.infra.db.session import get_db_session


def get_project_repo(session: Session = Depends(get_db_session)) -> ProjectRepo:
    return ProjectRepo(session)


def get_clip_repo(session: Session = Depends(get_db_session)) -> ClipRepo:
    return ClipRepo(session)


def get_asset_repo(session: Session = Depends(get_db_session)) -> AssetRepo:
    return AssetRepo(session)

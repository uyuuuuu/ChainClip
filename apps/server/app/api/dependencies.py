from __future__ import annotations

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.infra.db.repository import AssetRepo, ClipRepo, ProjectRepo
from app.infra.db.session import get_db_session


def get_access_token(authorization: str = Header(alias="Authorization")) -> str:
    """Authorization: Bearer <token> ヘッダからaccess_tokenを取り出す。

    形式が不正な場合は401を返す。トークンの照合自体はusecase側の
    project.verify_access() が行う。
    """
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    return token


def get_project_repo(session: Session = Depends(get_db_session)) -> ProjectRepo:
    return ProjectRepo(session)


def get_clip_repo(session: Session = Depends(get_db_session)) -> ClipRepo:
    return ClipRepo(session)


def get_asset_repo(session: Session = Depends(get_db_session)) -> AssetRepo:
    return AssetRepo(session)

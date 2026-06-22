from __future__ import annotations

import os
from collections.abc import Generator

from fastapi import Depends
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from dotenv import load_dotenv

from app.infra.db.repository import ClipRepo, ProjectRepo

load_dotenv()

# psycopg(v3)を明示的に使わせるため "postgresql+psycopg://" に書き換え
_DATABASE_URL = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(_DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


def get_db_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def get_project_repo(session: Session = Depends(get_db_session)) -> ProjectRepo:
    return ProjectRepo(session)


def get_clip_repo(session: Session = Depends(get_db_session)) -> ClipRepo:
    return ClipRepo(session)

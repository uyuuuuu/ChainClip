from __future__ import annotations

import os
from collections.abc import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

load_dotenv()

# psycopg(v3)を明示的に使わせるため "postgresql+psycopg://" に書き換え
_DATABASE_URL = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+psycopg://", 1)


# Cloud Run はアイドル時にスケールダウンするため、プール内のコネクションが
# DB側で先に切断されていることがある。pre_ping で使用前に生死を確認し、
# 切れていれば張り直す。recycle は念のためpingをすり抜ける古いコネクションの保険。
engine = create_engine(_DATABASE_URL, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(bind=engine)


def get_db_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

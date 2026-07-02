from __future__ import annotations

import time
from collections.abc import Generator

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from app.infra.db.models import Base

TEST_DATABASE_URL = "postgresql+psycopg://test:test@localhost:5433/chainclip_test"


@pytest.fixture(scope="session")
def engine() -> Generator[Engine, None, None]:
    """テスト用postgresへの接続を確立し、テーブルを作成する。テストセッション全体で1回だけ実行。"""
    test_engine = create_engine(TEST_DATABASE_URL)

    for _ in range(30):
        try:
            with test_engine.connect():
                break
        except OperationalError:
            time.sleep(1)
    else:
        raise RuntimeError(
            "test用postgres(localhost:5433)に接続できません。`make test-db-up`を実行してください。"
        )

    Base.metadata.create_all(test_engine)
    yield test_engine
    Base.metadata.drop_all(test_engine)
    test_engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Generator[Session, None, None]:
    """repository層はメソッド毎にcommitするため、SAVEPOINTを使い、外側のtransactionは
    テスト終了時にrollbackすることでDBへの変更を毎テストごとに消す。"""
    connection = engine.connect()
    transaction = connection.begin()
    db_session = sessionmaker(bind=connection)()

    nested = connection.begin_nested()

    @event.listens_for(db_session, "after_transaction_end")
    def _restart_savepoint(sess: Session, trans: object) -> None:
        nonlocal nested
        if not nested.is_active:
            nested = connection.begin_nested()

    yield db_session

    db_session.close()
    transaction.rollback()
    connection.close()

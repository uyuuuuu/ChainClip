from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Text, func
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.domain.project import ProjectStatus


class Base(DeclarativeBase):
    pass


# Enumの値の方
project_status_enum = PgEnum(
    ProjectStatus,
    name="project_status",
    values_callable=lambda enum_cls: [status.value for status in enum_cls],
)


class ProjectModel(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    device_id: Mapped[uuid.UUID] = mapped_column(index=True, nullable=False)
    title: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    edit_config: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    status: Mapped[ProjectStatus] = mapped_column(project_status_enum, nullable=False, default=ProjectStatus.DRAFT)
    share_slug: Mapped[str | None] = mapped_column(Text, unique=True)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    error_phase: Mapped[str | None] = mapped_column(Text)
    error_code: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column()

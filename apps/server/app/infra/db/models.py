from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.domain.asset import AssetKind, StorageProvider
from app.domain.clip import ClipStatus
from app.domain.job import JobStatus, JobType
from app.domain.project import ProjectStatus


class Base(DeclarativeBase):
    pass


# Enumの値の方
project_status_enum = PgEnum(
    ProjectStatus,
    name="project_status",
    values_callable=lambda enum_cls: [status.value for status in enum_cls],
)

clip_status_enum = PgEnum(
    ClipStatus,
    name="clip_status",
    values_callable=lambda enum_cls: [status.value for status in enum_cls],
)

asset_kind_enum = PgEnum(
    AssetKind,
    name="asset_kind",
    values_callable=lambda enum_cls: [status.value for status in enum_cls],
)

storage_provider_enum = PgEnum(
    StorageProvider,
    name="storage_provider",
    values_callable=lambda enum_cls: [status.value for status in enum_cls],
)

job_type_enum = PgEnum(
    JobType,
    name="job_type",
    values_callable=lambda enum_cls: [status.value for status in enum_cls],
)

job_status_enum = PgEnum(
    JobStatus,
    name="job_status",
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


class ProjectClipModel(Base):
    __tablename__ = "project_clips"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    clip_index: Mapped[int] = mapped_column(Integer, nullable=False)
    original_filename: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str | None] = mapped_column(Text)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[ClipStatus] = mapped_column(clip_status_enum, nullable=False, default=ClipStatus.UPLOADING)
    error_code: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)


class ProjectAssetModel(Base):
    __tablename__ = "project_assets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    clip_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("project_clips.id", ondelete="CASCADE"))
    kind: Mapped[AssetKind] = mapped_column(asset_kind_enum, nullable=False)
    storage_provider: Mapped[StorageProvider] = mapped_column(storage_provider_enum, nullable=False)
    bucket: Mapped[str] = mapped_column(Text, nullable=False)
    object_key: Mapped[str] = mapped_column(Text, nullable=False)
    public_url: Mapped[str | None] = mapped_column(Text)
    content_type: Mapped[str | None] = mapped_column(Text)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)


class ProcessingJobModel(Base):
    __tablename__ = "processing_jobs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    clip_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("project_clips.id", ondelete="CASCADE"))
    job_type: Mapped[JobType] = mapped_column(job_type_enum, nullable=False)
    status: Mapped[JobStatus] = mapped_column(job_status_enum, nullable=False, default=JobStatus.QUEUED)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    cloud_run_execution_name: Mapped[str | None] = mapped_column(Text)
    error_code: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column()
    finished_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

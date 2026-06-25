from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.asset import ProjectAsset
from app.domain.clip import Clip
from app.domain.job import ProcessingJob
from app.domain.project import Project
from app.infra.db.models import (
    ProcessingJobModel,
    ProjectAssetModel,
    ProjectClipModel,
    ProjectModel,
)


class ProjectRepo:
    """projectsテーブルへのアクセスを担う。"""

    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, project: Project) -> Project:
        model = ProjectModel(
            id=project.id,
            device_id=project.device_id,
            title=project.title,
            description=project.description,
            status=project.status,
            share_slug=project.share_slug,
            access_token=project.access_token,
        )
        self.session.add(model)
        self.session.commit()
        self.session.refresh(model)

        project.created_at = model.created_at
        project.updated_at = model.updated_at
        return project

    def get_by_id(self, project_id: uuid.UUID) -> Project | None:
        model = self.session.get(ProjectModel, project_id)
        if model is None:
            return None
        return Project(
            id=model.id,
            device_id=model.device_id,
            status=model.status,
            access_token=model.access_token,
            title=model.title,
            description=model.description,
            share_slug=model.share_slug,
            error_phase=model.error_phase,
            error_code=model.error_code,
            error_message=model.error_message,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    def update(self, project: Project) -> None:
        model = self.session.get(ProjectModel, project.id)
        if model is None:
            raise ValueError(f"project not found: {project.id}")

        model.status = project.status
        model.error_phase = project.error_phase
        model.error_code = project.error_code
        model.error_message = project.error_message
        self.session.commit()
        self.session.refresh(model)
        project.updated_at = model.updated_at


class ClipRepo:
    """project_clipsテーブルへのアクセスを担う。"""

    def __init__(self, session: Session) -> None:
        self.session = session

    def create_many(self, clips: list[Clip]) -> list[Clip]:
        models = [
            ProjectClipModel(
                id=clip.id,
                project_id=clip.project_id,
                clip_index=clip.clip_index,
                original_filename=clip.original_filename,
                content_type=clip.content_type,
                size_bytes=clip.size_bytes,
                status=clip.status,
            )
            for clip in clips
        ]
        self.session.add_all(models)
        self.session.commit()

        for clip, model in zip(clips, models, strict=True):
            self.session.refresh(model)
            clip.created_at = model.created_at
            clip.updated_at = model.updated_at
        return clips

    def get_by_id(self, clip_id: uuid.UUID) -> Clip | None:
        model = self.session.get(ProjectClipModel, clip_id)
        if model is None:
            return None
        return _clip_from_model(model)

    def list_by_project_id(self, project_id: uuid.UUID) -> list[Clip]:
        models = (
            self.session.execute(
                select(ProjectClipModel)
                .where(ProjectClipModel.project_id == project_id)
                .order_by(ProjectClipModel.clip_index)
            )
            .scalars()
            .all()
        )
        return [_clip_from_model(model) for model in models]

    def update(self, clip: Clip) -> None:
        model = self.session.get(ProjectClipModel, clip.id)
        if model is None:
            raise ValueError(f"clip not found: {clip.id}")

        model.status = clip.status
        model.duration_ms = clip.duration_ms
        model.error_code = clip.error_code
        model.error_message = clip.error_message
        self.session.commit()
        self.session.refresh(model)
        clip.updated_at = model.updated_at


def _clip_from_model(model: ProjectClipModel) -> Clip:
    return Clip(
        id=model.id,
        project_id=model.project_id,
        clip_index=model.clip_index,
        original_filename=model.original_filename,
        status=model.status,
        content_type=model.content_type,
        size_bytes=model.size_bytes,
        duration_ms=model.duration_ms,
        error_code=model.error_code,
        error_message=model.error_message,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


class AssetRepo:
    """project_assetsテーブルへのアクセスを担う。"""

    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, asset: ProjectAsset) -> ProjectAsset:
        model = ProjectAssetModel(
            id=asset.id,
            project_id=asset.project_id,
            clip_id=asset.clip_id,
            kind=asset.kind,
            storage_provider=asset.storage_provider,
            bucket=asset.bucket,
            object_key=asset.object_key,
            public_url=asset.public_url,
            content_type=asset.content_type,
            size_bytes=asset.size_bytes,
        )
        self.session.add(model)
        self.session.commit()
        self.session.refresh(model)

        asset.created_at = model.created_at
        return asset


class ProcessingJobRepo:
    """processing_jobsテーブルへのアクセスを担う。"""

    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, job: ProcessingJob) -> ProcessingJob:
        model = ProcessingJobModel(
            id=job.id,
            project_id=job.project_id,
            clip_id=job.clip_id,
            job_type=job.job_type,
            status=job.status,
            attempt=job.attempt,
            cloud_run_execution_name=job.cloud_run_execution_name,
        )
        self.session.add(model)
        self.session.commit()
        self.session.refresh(model)

        job.created_at = model.created_at
        job.updated_at = model.updated_at
        return job

    def update(self, job: ProcessingJob) -> None:
        model = self.session.get(ProcessingJobModel, job.id)
        if model is None:
            raise ValueError(f"processing job not found: {job.id}")

        model.status = job.status
        model.started_at = job.started_at
        model.finished_at = job.finished_at
        model.error_code = job.error_code
        model.error_message = job.error_message
        self.session.commit()
        self.session.refresh(model)
        job.updated_at = model.updated_at

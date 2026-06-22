from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.domain.clip import Clip
from app.domain.project import Project
from app.infra.db.models import ProjectClipModel, ProjectModel


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
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    def update(self, project: Project) -> None:
        model = self.session.get(ProjectModel, project.id)
        if model is None:
            raise ValueError(f"project not found: {project.id}")

        model.status = project.status
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

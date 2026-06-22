from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.project import Project
from app.infra.db.models import ProjectModel


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

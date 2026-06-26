from __future__ import annotations

import uuid
from copy import deepcopy
from datetime import datetime, timezone

from app.domain.clip import Clip
from app.domain.project import Project


class FakeProjectRepo:
    """ProjectRepoと同じインターフェースを持つ、DB不要のusecaseテスト用フェイク。"""

    def __init__(self) -> None:
        self._projects: dict[uuid.UUID, Project] = {}

    def create(self, project: Project) -> Project:
        project.created_at = datetime.now(timezone.utc)
        project.updated_at = project.created_at
        self._projects[project.id] = deepcopy(project)
        return project

    def get_by_id(self, project_id: uuid.UUID) -> Project | None:
        project = self._projects.get(project_id)
        return deepcopy(project) if project is not None else None

    def update(self, project: Project) -> None:
        if project.id not in self._projects:
            raise ValueError(f"project not found: {project.id}")
        project.updated_at = datetime.now(timezone.utc)
        self._projects[project.id] = deepcopy(project)


class FakeClipRepo:
    """ClipRepoと同じインターフェースを持つ、DB不要のusecaseテスト用フェイク。"""

    def __init__(self) -> None:
        self._clips: dict[uuid.UUID, Clip] = {}

    def create_many(self, clips: list[Clip]) -> list[Clip]:
        now = datetime.now(timezone.utc)
        for clip in clips:
            clip.created_at = now
            clip.updated_at = now
            self._clips[clip.id] = deepcopy(clip)
        return clips

    def get_by_id(self, clip_id: uuid.UUID) -> Clip | None:
        clip = self._clips.get(clip_id)
        return deepcopy(clip) if clip is not None else None

    def list_by_project_id(self, project_id: uuid.UUID) -> list[Clip]:
        return [
            deepcopy(clip)
            for clip in sorted(self._clips.values(), key=lambda c: c.clip_index)
            if clip.project_id == project_id
        ]

    def update(self, clip: Clip) -> None:
        if clip.id not in self._clips:
            raise ValueError(f"clip not found: {clip.id}")
        clip.updated_at = datetime.now(timezone.utc)
        self._clips[clip.id] = deepcopy(clip)

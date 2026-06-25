from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class JobType(str, Enum):
    CONVERT_CLIP = "convert_clip"    # mp4変換処理
    ANALYZE_CLIP = "analyze_clip"    # Video Intelligence API解析処理
    RENDER_FINAL = "render_final"    # 完成動画生成処理
    FULL_PIPELINE = "full_pipeline"  # 一連の処理をまとめたもの


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass
class ProcessingJob:
    """processing_jobsテーブルに対応するエンティティ。worker実行履歴を表す。"""

    id: uuid.UUID
    project_id: uuid.UUID
    job_type: JobType
    status: JobStatus
    clip_id: uuid.UUID | None = None
    attempt: int = 1
    cloud_run_execution_name: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def create(
        cls,
        *,
        project_id: uuid.UUID,
        job_type: JobType,
        clip_id: uuid.UUID | None = None,
        attempt: int = 1,
        cloud_run_execution_name: str | None = None,
    ) -> "ProcessingJob":
        """新規jobを作成する。statusはqueued。"""
        return cls(
            id=uuid.uuid4(),
            project_id=project_id,
            job_type=job_type,
            status=JobStatus.QUEUED,
            clip_id=clip_id,
            attempt=attempt,
            cloud_run_execution_name=cloud_run_execution_name,
        )

    def mark_running(self, *, started_at: datetime) -> None:
        """workerが処理を開始したら呼ぶ。"""
        self.status = JobStatus.RUNNING
        self.started_at = started_at

    def mark_succeeded(self, *, finished_at: datetime) -> None:
        """workerが処理を完了したら呼ぶ。"""
        self.status = JobStatus.SUCCEEDED
        self.finished_at = finished_at

    def mark_failed(self, *, finished_at: datetime, error_code: str, error_message: str) -> None:
        """workerの処理に失敗したら呼ぶ。"""
        self.status = JobStatus.FAILED
        self.finished_at = finished_at
        self.error_code = error_code
        self.error_message = error_message

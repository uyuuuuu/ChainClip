from __future__ import annotations

import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.domain.asset import AssetKind, ProjectAsset, StorageProvider
from app.domain.clip import Clip
from app.domain.error import DomainError, ProjectNotFoundError
from app.domain.job import JobType, ProcessingJob
from app.infra.db.repository import AssetRepo, ClipRepo, ProcessingJobRepo, ProjectRepo
from app.infra.db.session import SessionLocal
from app.infra.storage import gcs
from app.infra.video import ffmpeg

GCS_BUCKET_NAME = "GCS_BUCKET_NAME"


def run(project_id: uuid.UUID) -> None:
    """Cloud Run Jobsのprepare workerエントリポイント。

    project配下の全clipをFFmpegでmp4変換し、Video Intelligence解析結果を
    project_assetsに記録する。完了したらproject.status=readyに更新する。
    """
    session = SessionLocal()
    try:
        project_repo = ProjectRepo(session)
        clip_repo = ClipRepo(session)
        asset_repo = AssetRepo(session)
        job_repo = ProcessingJobRepo(session)

        project = project_repo.get_by_id(project_id)
        if project is None:
            raise ProjectNotFoundError(f"project not found: {project_id}")

        job = job_repo.create(ProcessingJob.create(project_id=project_id, job_type=JobType.FULL_PIPELINE))
        job.mark_running(started_at=datetime.now(timezone.utc))
        job_repo.update(job)

        try:
            for clip in clip_repo.list_by_project_id(project_id):
                _prepare_clip(clip_repo, asset_repo, clip)

            project.mark_ready()
            project_repo.update(project)

            job.mark_succeeded(finished_at=datetime.now(timezone.utc))
            job_repo.update(job)
        except DomainError as exc:
            project.mark_failed(
                error_phase="prepare",
                error_code=type(exc).__name__,
                error_message=str(exc),
            )
            project_repo.update(project)

            job.mark_failed(
                finished_at=datetime.now(timezone.utc),
                error_code=type(exc).__name__,
                error_message=str(exc),
            )
            job_repo.update(job)
            raise
    finally:
        session.close()


def _prepare_clip(clip_repo: ClipRepo, asset_repo: AssetRepo, clip: Clip) -> None:
    clip.mark_processing()
    clip_repo.update(clip)

    bucket_name = os.environ[GCS_BUCKET_NAME]

    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            original_path = Path(tmp_dir) / "original"
            converted_path = Path(tmp_dir) / "converted.mp4"

            gcs.download_file(clip.original_object_key(), original_path)
            ffmpeg.convert_to_mp4(original_path, converted_path)
            duration_ms = ffmpeg.get_duration_ms(converted_path)

            converted_key = gcs.upload_file(
                clip.converted_object_key(),
                converted_path,
                content_type="video/mp4",
            )
            asset_repo.create(
                ProjectAsset.create(
                    project_id=clip.project_id,
                    clip_id=clip.id,
                    kind=AssetKind.CONVERTED_CLIP,
                    storage_provider=StorageProvider.GCS,
                    bucket=bucket_name,
                    object_key=converted_key,
                    content_type="video/mp4",
                    size_bytes=converted_path.stat().st_size,
                )
            )

            # TODO: ダミーのシーン区間のため置き換え
            scene_candidates_key = gcs.upload_json(
                clip.scene_candidates_object_key(),
                {
                    "clipId": str(clip.id),
                    "scenes": [
                        {"startMs": 0, "endMs": duration_ms, "labels": ["dummy"]},
                    ],
                },
            )
            asset_repo.create(
                ProjectAsset.create(
                    project_id=clip.project_id,
                    clip_id=clip.id,
                    kind=AssetKind.SCENE_CANDIDATES,
                    storage_provider=StorageProvider.GCS,
                    bucket=bucket_name,
                    object_key=scene_candidates_key,
                    content_type="application/json",
                )
            )

        clip.mark_ready(duration_ms=duration_ms)
        clip_repo.update(clip)
    except ffmpeg.FfmpegConversionError as exc:
        clip.mark_failed(error_code="FFMPEG_FAILED", error_message=str(exc))
        clip_repo.update(clip)
        raise
    except DomainError as exc:
        clip.mark_failed(error_code=type(exc).__name__, error_message=str(exc))
        clip_repo.update(clip)
        raise


if __name__ == "__main__":
    run(uuid.UUID(os.environ["PROJECT_ID"]))

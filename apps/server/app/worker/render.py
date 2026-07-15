from __future__ import annotations

import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.domain.asset import AssetKind, ProjectAsset, StorageProvider
from app.domain.edit_config import (
    OUTPUT_FPS,
    OUTPUT_HEIGHT,
    OUTPUT_WIDTH,
    TRANSITION_DURATION_MS,
    EditConfig,
    crop_rect,
)
from app.domain.error import ClipNotFoundError, DomainError, ProjectNotFoundError
from app.domain.job import JobType, ProcessingJob
from app.infra.db.repository import AssetRepo, ClipRepo, ProcessingJobRepo, ProjectRepo
from app.infra.db.session import SessionLocal
from app.infra.storage import gcs, r2
from app.infra.video import ffmpeg

R2_BUCKET_NAME = "R2_BUCKET_NAME"


def run(project_id: uuid.UUID) -> None:
    """Cloud Run Jobsのrender workerエントリポイント。

    project.edit_configのtimelineに従って各カットを切り出し・結合し、
    完成mp4をR2にアップロードする。完了したらproject.status=completedに更新し、
    GCS上の中間ファイルを削除する。
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

        job = job_repo.create(ProcessingJob.create(project_id=project_id, job_type=JobType.RENDER_FINAL))
        job.mark_running(started_at=datetime.now(timezone.utc))
        job_repo.update(job)

        try:
            edit_config = EditConfig.from_dict(project.edit_config)

            with tempfile.TemporaryDirectory() as tmp_dir:
                final_path = _render(clip_repo, edit_config, Path(tmp_dir))

                bucket_name = os.environ[R2_BUCKET_NAME]
                object_key = project.final_object_key()
                public_url = r2.upload_file(object_key, final_path, content_type="video/mp4")

                asset_repo.create(
                    ProjectAsset.create(
                        project_id=project.id,
                        kind=AssetKind.FINAL_CLIP,
                        storage_provider=StorageProvider.R2,
                        bucket=bucket_name,
                        object_key=object_key,
                        public_url=public_url,
                        content_type="video/mp4",
                        size_bytes=final_path.stat().st_size,
                    )
                )

            project.mark_completed()
            project_repo.update(project)

            gcs.delete_prefix(f"original/{project.id}/")
            gcs.delete_prefix(f"converted/{project.id}/")
            gcs.delete_prefix(f"scenes/{project.id}/")

            job.mark_succeeded(finished_at=datetime.now(timezone.utc))
            job_repo.update(job)
        except DomainError as exc:
            project.mark_failed(
                error_phase="render",
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


def _render(clip_repo: ClipRepo, edit_config: EditConfig, tmp_dir: Path) -> Path:
    downloaded: dict[uuid.UUID, Path] = {}
    segment_paths: list[Path] = []

    for index, cut in enumerate(edit_config.timeline):
        clip = clip_repo.get_by_id(cut.clip_id)
        if clip is None:
            raise ClipNotFoundError(f"clip not found: {cut.clip_id}")

        source_path = downloaded.get(cut.clip_id)
        if source_path is None:
            source_path = tmp_dir / f"source_{cut.clip_id}.mp4"
            gcs.download_file(clip.converted_object_key(), source_path)
            downloaded[cut.clip_id] = source_path

        crop_width, crop_height, crop_x, crop_y = crop_rect(
            src_width=clip.width,
            src_height=clip.height,
            target_width=OUTPUT_WIDTH,
            target_height=OUTPUT_HEIGHT,
            zoom=cut.transform.zoom,
            offset_x=cut.transform.offset_x,
            offset_y=cut.transform.offset_y,
            rotation=cut.transform.rotation,
        )

        segment_path = tmp_dir / f"segment_{index}.mp4"
        ffmpeg.render_cut(
            source_path,
            segment_path,
            start_ms=cut.start_ms,
            end_ms=cut.end_ms,
            crop_width=crop_width,
            crop_height=crop_height,
            crop_x=crop_x,
            crop_y=crop_y,
            rotation=cut.transform.rotation,
            output_width=OUTPUT_WIDTH,
            output_height=OUTPUT_HEIGHT,
            fps=OUTPUT_FPS,
        )
        segment_paths.append(segment_path)

    final_path = tmp_dir / "final.mp4"
    ffmpeg.concat_cuts(
        segment_paths,
        final_path,
        transition_type=edit_config.transition,
        transition_duration_ms=TRANSITION_DURATION_MS,
    )
    return final_path


if __name__ == "__main__":
    run(uuid.UUID(os.environ["PROJECT_ID"]))

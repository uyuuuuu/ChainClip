from __future__ import annotations

import logging
import os
import sys
import tempfile
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
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
from app.domain import detection
from app.infra.video import intelligence
from app.domain.detection import LabelTrack

GCS_BUCKET_NAME = "GCS_BUCKET_NAME"

logger = logging.getLogger(__name__)


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


def _timed(label: str, fn, *args, **kwargs):
    """fnを実行し、所要時間をログに出す。並列実行される処理の内訳を測るために使う。"""
    started = time.monotonic()
    logger.info("%s: start", label)
    try:
        return fn(*args, **kwargs)
    finally:
        logger.info("%s: done in %.1fs", label, time.monotonic() - started)


def _prepare_clip(clip_repo: ClipRepo, asset_repo: AssetRepo, clip: Clip) -> None:
    logger.info("clip %s: start (index=%s)", clip.id, clip.clip_index)
    clip_started = time.monotonic()

    clip.mark_processing()
    clip_repo.update(clip)

    bucket_name = os.environ[GCS_BUCKET_NAME]

    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            original_path = Path(tmp_dir) / "original"
            converted_path = Path(tmp_dir) / "converted.mp4"

            _timed("download", gcs.download_file, clip.original_object_key(), original_path)
            logger.info("download: %.1fMB", original_path.stat().st_size / 1e6)

            # ffmpeg変換(CPU処理)とVideo Intelligence解析(API呼び出し・待ちが主)は
            # どちらも元ファイルだけを入力にしており依存関係がないため、
            # スレッドで並列に走らせて合計の待ち時間を縮める。
            # 解析は元ファイルのGCS URIをそのまま渡す(変換後mp4を待たない)。
            original_uri = f"gs://{bucket_name}/{clip.original_object_key()}"
            with ThreadPoolExecutor(max_workers=2) as executor:
                convert_future = executor.submit(
                    _timed, "convert", ffmpeg.convert_to_mp4, original_path, converted_path
                )
                labels_future = executor.submit(
                    _timed, "analyze", intelligence.fetch_labels, gcs_uri=original_uri
                )

                convert_future.result()
                tracks: list[LabelTrack] = labels_future.result()

            probe = ffmpeg.probe(converted_path)
            logger.info(
                "converted: %.1fMB, %dx%d, %.1fs",
                converted_path.stat().st_size / 1e6,
                probe.width,
                probe.height,
                probe.duration_ms / 1000,
            )

            converted_key = _timed(
                "upload",
                gcs.upload_file,
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

            # startMs/endMsは変換後mp4の長さに合わせて組み立てる(下流のrender workerが
            # 変換後mp4に対して切り出すため)。解析自体は元ファイル基準で行っている。
            scenes = detection.detect_scenes(tracks, duration_ms=probe.duration_ms)
 
            # get_project_status.py が読むのは startMs / endMs / labels のみ。
            # sceneId は読み出し側で採番、sceneIndex は enumerate で採番するため含めない。
            scene_candidates_key = gcs.upload_json(
                clip.scene_candidates_object_key(),
                {
                    "clipId": str(clip.id),
                    "scenes": [
                        {
                            "startMs": s.start_ms,
                            "endMs": s.end_ms,
                            "labels": s.labels,
                        }
                        for s in scenes
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

        clip.mark_ready(duration_ms=probe.duration_ms, width=probe.width, height=probe.height)
        clip_repo.update(clip)
        logger.info("clip %s: ready in %.1fs", clip.id, time.monotonic() - clip_started)
    except ffmpeg.FfmpegConversionError as exc:
        logger.exception("clip %s: ffmpeg failed after %.1fs", clip.id, time.monotonic() - clip_started)
        clip.mark_failed(error_code="FFMPEG_FAILED", error_message=str(exc))
        clip_repo.update(clip)
        raise
    except DomainError as exc:
        logger.exception("clip %s: failed after %.1fs", clip.id, time.monotonic() - clip_started)
        clip.mark_failed(error_code=type(exc).__name__, error_message=str(exc))
        clip_repo.update(clip)
        raise


if __name__ == "__main__":
    # Cloud Run Jobsはstdout/stderrをそのままCloud Loggingに送るため、
    # ハンドラはstdoutへの出力だけあればよい。
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stdout,
    )
    run(uuid.UUID(os.environ["PROJECT_ID"]))

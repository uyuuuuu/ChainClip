from __future__ import annotations

import os
import uuid

from google.cloud import run_v2


def trigger_prepare_job(project_id: uuid.UUID) -> None:
    """Cloud Run Jobsのprepare workerを実行する。"""
    client = run_v2.JobsClient()
    job_name = client.job_path(
        os.environ["GCP_PROJECT_ID"],
        os.environ["GCP_REGION"],
        os.environ["CLOUD_RUN_PREPARE_JOB_NAME"],
    )
    request = run_v2.RunJobRequest(
        name=job_name,
        overrides=run_v2.RunJobRequest.Overrides(
            container_overrides=[
                run_v2.RunJobRequest.Overrides.ContainerOverride(
                    env=[run_v2.EnvVar(name="PROJECT_ID", value=str(project_id))],
                ),
            ],
        ),
    )
    client.run_job(request=request)

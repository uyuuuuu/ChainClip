from __future__ import annotations

import datetime
import json
import os
from pathlib import Path
from typing import Any

from google.cloud import exceptions as gcs_exceptions
from google.cloud import storage

from app.domain.error import GcsObjectNotFoundError

storage_client = storage.Client()


def generate_signed_upload_url(key: str, *, content_type: str, expires_in_seconds: int = 600) -> str:
    """モバイルがGCSに直接アップロードするための signed URL(PUT)を発行する。"""
    bucket_name = os.environ["GCS_BUCKET_NAME"]
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(key)

    return blob.generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(seconds=expires_in_seconds),
        method="PUT",
        content_type=content_type,
    )


def download_file(key: str, destination: Path) -> None:
    """GCS上のオブジェクトをローカルファイルにダウンロードする。"""
    bucket_name = os.environ["GCS_BUCKET_NAME"]
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(key)

    try:
        blob.download_to_filename(str(destination))
    except gcs_exceptions.NotFound as exc:
        raise GcsObjectNotFoundError(f"gcs object not found: {key}") from exc


def upload_file(key: str, source: Path, *, content_type: str) -> str:
    """ローカルファイルをGCSにアップロードし、object keyを返す。"""
    bucket_name = os.environ["GCS_BUCKET_NAME"]
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(key)
    blob.upload_from_filename(str(source), content_type=content_type)
    return key


def upload_json(key: str, data: dict[str, Any]) -> str:
    """JSONデータをGCSにアップロードし、object keyを返す。"""
    bucket_name = os.environ["GCS_BUCKET_NAME"]
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(key)
    blob.upload_from_string(json.dumps(data), content_type="application/json")
    return key

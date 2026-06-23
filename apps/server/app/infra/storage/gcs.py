from __future__ import annotations

import datetime
import os

from google.cloud import storage

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

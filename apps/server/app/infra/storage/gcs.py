from __future__ import annotations

import datetime
import json
import os
from pathlib import Path
from typing import Any

from google.auth.compute_engine import credentials as gce_credentials
from google.auth.transport import requests as google_auth_requests
from google.cloud import exceptions as gcs_exceptions
from google.cloud import storage

from app.domain.error import GcsObjectNotFoundError

storage_client = storage.Client()


def _signing_credentials() -> gce_credentials.IDTokenCredentials | None:
    """Cloud Run/GCE上は秘密鍵を持たないため、IAM SignBlob経由で署名するcredentialsを作る。
    ローカルのキーファイル認証の場合はNoneを返し、デフォルトの署名方法に任せる。"""
    credentials = storage_client._credentials
    if not isinstance(credentials, gce_credentials.Credentials):
        return None

    request = google_auth_requests.Request()
    credentials.refresh(request)
    return gce_credentials.IDTokenCredentials(
        request,
        "",
        service_account_email=credentials.service_account_email,
    )


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
        credentials=_signing_credentials(),
    )


def generate_signed_download_url(key: str, *, expires_in_seconds: int = 3600) -> str:
    """再生用に変換後mp4を取得するための signed URL(GET)を発行する。"""
    bucket_name = os.environ["GCS_BUCKET_NAME"]
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(key)

    return blob.generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(seconds=expires_in_seconds),
        method="GET",
        credentials=_signing_credentials(),
    )


def read_json(key: str) -> dict[str, Any]:
    """GCS上のJSONオブジェクトを読み込んで返す。"""
    bucket_name = os.environ["GCS_BUCKET_NAME"]
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(key)

    try:
        return json.loads(blob.download_as_text())
    except gcs_exceptions.NotFound as exc:
        raise GcsObjectNotFoundError(f"gcs object not found: {key}") from exc


def object_exists(key: str) -> bool:
    """GCS上に指定したキーのオブジェクトが存在するか確認する。"""
    bucket_name = os.environ["GCS_BUCKET_NAME"]
    bucket = storage_client.bucket(bucket_name)
    return bucket.blob(key).exists()


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


def delete_prefix(prefix: str) -> None:
    """GCS上の指定prefix配下のオブジェクトをすべて削除する。"""
    bucket_name = os.environ["GCS_BUCKET_NAME"]
    bucket = storage_client.bucket(bucket_name)
    for blob in bucket.list_blobs(prefix=prefix):
        blob.delete()

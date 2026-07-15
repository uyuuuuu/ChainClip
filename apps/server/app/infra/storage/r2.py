from __future__ import annotations

import os
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.domain.error import R2UploadError, StorageDeleteError

_client = None


def _get_client():
    """R2はS3互換APIのため、boto3のS3クライアントをR2のエンドポイントに向けて使う。"""
    global _client
    if _client is None:
        account_id = os.environ["R2_ACCOUNT_ID"]
        _client = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
        )
    return _client


def upload_file(key: str, source: Path, *, content_type: str) -> str:
    """ローカルファイルをR2にアップロードし、公開URLを返す。"""
    bucket_name = os.environ["R2_BUCKET_NAME"]
    try:
        _get_client().upload_file(
            str(source),
            bucket_name,
            key,
            ExtraArgs={"ContentType": content_type},
        )
    except (BotoCoreError, ClientError) as exc:
        raise R2UploadError(str(exc)) from exc

    public_base_url = os.environ["R2_PUBLIC_BASE_URL"]
    return f"{public_base_url.rstrip('/')}/{key}"


def delete_object(key: str) -> None:
    """R2上のオブジェクトを削除する。

    S3互換APIのdelete_objectは対象が存在しなくても成功を返すため、
    既に削除済みのキーを渡しても例外にならない。
    """
    bucket_name = os.environ["R2_BUCKET_NAME"]
    try:
        _get_client().delete_object(Bucket=bucket_name, Key=key)
    except (BotoCoreError, ClientError) as exc:
        raise StorageDeleteError(f"failed to delete r2 object: {key}") from exc

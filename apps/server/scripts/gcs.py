import os
from pathlib import Path
from google.cloud import storage

storage_client = storage.Client()


def upload_file_to_gcs(file_obj, key: str, content_type: str | None = None) -> str:
    bucket_name = os.environ["GCS_BUCKET_NAME"]
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(key)

    blob.upload_from_file(
        file_obj,
        content_type=content_type,
        rewind=True,
    )

    return f"gs://{bucket_name}/{key}"


def download_gcs_file(key: str, local_path: str) -> None:
    bucket_name = os.environ["GCS_BUCKET_NAME"]
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(key)

    Path(local_path).parent.mkdir(parents=True, exist_ok=True)
    blob.download_to_filename(local_path)

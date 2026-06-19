import os

from dotenv import load_dotenv
from google.cloud import storage

load_dotenv()


def upload_file_to_gcs(file_obj, key: str, content_type: str | None = None) -> str:
    bucket_name = os.environ["GCS_BUCKET_NAME"]
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(key)

    blob.upload_from_file(
        file_obj,
        content_type=content_type,
        rewind=True,
    )

    return f"gs://{bucket_name}/{key}"

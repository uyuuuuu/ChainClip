import os

import boto3
from dotenv import load_dotenv

load_dotenv()

r2_client = boto3.client(
    "s3",
    endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    region_name="auto",
)


def upload_file_to_r2(local_path: str, key: str, content_type: str = "video/mp4") -> str:
    r2_client.upload_file(
        Filename=local_path,
        Bucket=os.environ["R2_BUCKET_NAME"],
        Key=key,
        ExtraArgs={"ContentType": content_type},
    )

    return key

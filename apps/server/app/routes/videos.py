import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.gcs import upload_file_to_gcs

router = APIRouter(prefix="/videos", tags=["videos"])


@router.post("")
async def upload_video(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="video file only")

    video_id = str(uuid.uuid4())

    ext = ""
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[1].lower()

    key = f"original/{video_id}{ext}"

    gcs_uri = upload_file_to_gcs(
        file.file,
        key=key,
        content_type=file.content_type,
    )

    return {
        "videoId": video_id,
        "gcsUri": gcs_uri,
        "filename": file.filename,
        "contentType": file.content_type,
    }

"""開発用: 共有閲覧ページの動作確認のため、completed状態のダミープロジェクトを1件作成する。

render pipeline(FFmpeg結合・R2アップロード)がまだ実装されていないため、
実際の完成動画の代わりに公開サンプルmp4のURLをfinal_clip assetとして登録する。

使い方:
    apps/server で venvを有効化した状態で実行する。
    python -m scripts.seed_completed_project
"""

from __future__ import annotations

import uuid

from app.domain.asset import AssetKind, ProjectAsset, StorageProvider
from app.domain.project import Project
from app.infra.db.repository import AssetRepo, ProjectRepo
from app.infra.db.session import SessionLocal

SAMPLE_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"


def main() -> None:
    session = SessionLocal()
    try:
        project_repo = ProjectRepo(session)
        asset_repo = AssetRepo(session)

        project = Project.create(device_id=uuid.uuid4())
        project.title = "動作確認用サンプル"
        project.description = "共有閲覧ページの動作確認用に作成したダミープロジェクトです。"
        project.mark_uploading()
        project.mark_uploaded()
        project.mark_preparing()
        project.mark_ready()
        project.mark_completed()
        project_repo.create(project)

        asset_repo.create(
            ProjectAsset.create(
                project_id=project.id,
                kind=AssetKind.FINAL_CLIP,
                storage_provider=StorageProvider.R2,
                bucket="chainclip-final-dev",
                object_key=f"final/{project.id}.mp4",
                public_url=SAMPLE_VIDEO_URL,
                content_type="video/mp4",
            )
        )

        print(f"project_id: {project.id}")
        print(f"share_slug: {project.share_slug}")
        print(f"share URL:  GET /share/{project.share_slug}")
    finally:
        session.close()


if __name__ == "__main__":
    main()

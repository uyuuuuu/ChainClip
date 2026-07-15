from __future__ import annotations

import uuid

from app.domain.asset import StorageProvider
from app.domain.error import ProjectNotFoundError
from app.infra.db.repository import AssetRepo, ProjectRepo
from app.infra.storage import gcs, r2


def delete_project(
    project_repo: ProjectRepo,
    asset_repo: AssetRepo,
    *,
    project_id: uuid.UUID,
    access_token: str,
) -> None:
    """DELETE /projects/{projectId}: 紐づくファイルを削除してからDB行を物理削除する。

    statusは問わない。失敗して終わったprojectや、アプリが落ちてuploading/preparingのまま
    止まったprojectも削除できる必要があるため、状態遷移のチェックはしない。

    ファイルが既に存在しない場合は削除済みとみなして続行する。通信エラー等で
    削除しきれなかった場合はStorageDeleteErrorが送出され、DB行は残る。
    行が残っていればクライアントから再度DELETEを呼んでリトライできるため、
    参照されないファイルがストレージに残り続けるのを防げる。
    """
    project = project_repo.get_by_id(project_id)
    if project is None:
        raise ProjectNotFoundError(f"project not found: {project_id}")

    project.verify_access(access_token)

    # R2側は完成動画のみ。assetが無い(render未実行/失敗)ならスキップされる。
    for asset in asset_repo.list_by_project_id(project_id):
        if asset.storage_provider == StorageProvider.R2:
            r2.delete_object(asset.object_key)

    # GCS側はassetの登録漏れがありうる。prepareの途中で落ちるとファイルだけ存在して
    # asset行が無い状態になるため、asset一覧ではなくprefixを走査して消す。
    for prefix in gcs_prefixes(project_id):
        gcs.delete_prefix(prefix)

    project_repo.delete(project_id)


def gcs_prefixes(project_id: uuid.UUID) -> list[str]:
    """projectに紐づくGCS上のファイルが置かれるprefix一覧。"""
    return [
        f"original/{project_id}/",
        f"converted/{project_id}/",
        f"scenes/{project_id}/",
    ]

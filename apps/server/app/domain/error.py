class DomainError(Exception):
    """ドメイン層の基底例外。"""


class ProjectNotFoundError(DomainError):
    """指定したproject_idのプロジェクトが存在しない場合。"""


class AccessDeniedError(DomainError):
    """access_tokenが一致しない場合。"""


class InvalidProjectStateError(DomainError):
    """projectのstatusが期待する状態と異なり、操作を許可できない場合。"""


class InvalidClipError(DomainError):
    """clipの入力データ(content_typeなど)が不正な場合。"""


class GcsObjectNotFoundError(DomainError):
    """GCS上に対象オブジェクトが存在しない場合。"""


class ClipNotFoundError(DomainError):
    """editConfigが参照するclipIdのclipが存在しない場合。"""


class R2UploadError(DomainError):
    """R2への完成動画アップロードに失敗した場合。"""

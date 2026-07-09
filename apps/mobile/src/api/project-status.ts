// プロジェクトの状態。設計書の project_status に対応。
export type ProjectStatus =
  | "draft"
  | "uploading"
  | "uploaded"
  | "preparing"
  | "ready"
  | "rendering"
  | "completed"
  | "failed";

import { apiFetch } from "./client";
import type { components } from "./schema";

type ClipUploadRequestBody = components["schemas"]["ClipUploadRequestBody"];
type ClipUploadUrlResponse = components["schemas"]["ClipUploadUrlResponse"];
type CompleteUploadResponse = components["schemas"]["CompleteUploadResponse"];

/**
 * POST /projects/{projectId}/clips/upload-urls
 * clipごとの clipId + 署名付き uploadUrl を発行する。project.status = uploading になる。
 * accessToken は apiFetch が projectId から解決し Authorization ヘッダに付与する。
 */
export async function requestUploadUrls(
  projectId: string,
  clips: ClipUploadRequestBody[],
): Promise<ClipUploadUrlResponse[]> {
  return await apiFetch<ClipUploadUrlResponse[]>(
    `/projects/${projectId}/clips/upload-urls`,
    {
      method: "POST",
      projectId,
      body: JSON.stringify({ clips }),
    },
  );
}

/**
 * PUT /clips/{clipId}/upload-complete
 * clip単位でアップロード完了を通知する。project_clips.status = uploaded になる。
 * clipIdからサーバーがプロジェクトを解決するためbodyは空。
 * projectId は accessToken 解決（Authorization ヘッダ付与）のためだけに渡す。
 */
export async function completeUpload(
  clipId: string,
  projectId: string,
): Promise<CompleteUploadResponse> {
  return await apiFetch<CompleteUploadResponse>(
    `/clips/${clipId}/upload-complete`,
    {
      method: "PUT",
      projectId,
    },
  );
}

import { apiFetch } from "./client";
import type { components } from "./schema";

type SharePageResponse = components["schemas"]["SharePageResponse"];

/**
 * GET /share/{shareSlug}
 * 共有URLから完成動画の閲覧情報（title / description / videoUrl）を取得する公開API。
 * 認証不要のため projectId は渡さない（apiFetch は Authorization ヘッダを付与しない）。
 * projects.status が completed でない場合はサーバーが404を返す。
 */
export async function getSharePage(
  shareSlug: string,
): Promise<SharePageResponse> {
  return await apiFetch<SharePageResponse>(`/share/${shareSlug}`);
}

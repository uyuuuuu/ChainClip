import { requestUploadUrls } from "@/api/clips";
import { useMutation } from "@tanstack/react-query";
import type { components } from "../api/schema";

type ClipUploadRequestBody = components["schemas"]["ClipUploadRequestBody"];
type ClipUploadUrlResponse = components["schemas"]["ClipUploadUrlResponse"];

type Variables = {
  projectId: string;
  clips: ClipUploadRequestBody[];
};

// POST /projects/{projectId}/clips/upload-urls
// clipごとの clipId + 署名付き uploadUrl を発行する。project.status = uploading になる。
// accessToken は api層(apiFetch)が projectId から解決してヘッダに付与する。
export function useRequestUploadUrls() {
  return useMutation({
    mutationFn: ({
      projectId,
      clips,
    }: Variables): Promise<ClipUploadUrlResponse[]> =>
      requestUploadUrls(projectId, clips),
  });
}

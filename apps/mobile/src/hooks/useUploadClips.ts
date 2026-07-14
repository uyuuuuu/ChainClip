import { useMutation } from "@tanstack/react-query";
import { completeUpload } from "../api/clips";
import type { components } from "../api/schema";
import { uploadToGcs } from "../api/upload";

type ClipUploadUrlResponse = components["schemas"]["ClipUploadUrlResponse"];
type CompleteUploadResponse = components["schemas"]["CompleteUploadResponse"];

// upload-urlsで得た1件と、対応するローカル動画のペア。
// contentType は署名時と一致必須なので upload-urls リクエスト時と同じ値を渡す。
export type ClipUploadTarget = {
  target: ClipUploadUrlResponse; // clipId, clipIndex, uploadUrl
  videoUri: string; // 端末内 file:// URI
  contentType: string;
};

type Variables = {
  projectId: string;
  items: ClipUploadTarget[];
  // 全clip合算の進捗(0〜1)。並列アップロードのため単調増加とは限らない。
  onProgress?: (ratio: number) => void;
};

// 1件分: GCSへPUT → upload-complete でサーバーに完了通知
async function uploadOne(
  projectId: string,
  item: ClipUploadTarget,
  onProgress?: (ratio: number) => void,
): Promise<CompleteUploadResponse> {
  await uploadToGcs(
    item.target.uploadUrl,
    item.videoUri,
    item.contentType,
    onProgress,
  );

  // GCSアップロード成功後、サーバーに完了通知
  // accessToken は api層が projectId から解決してヘッダに付与する。
  return completeUpload(item.target.clipId, projectId);
}

// 全clipを並列でGCSアップロードし、それぞれ upload-complete を呼ぶ。
// 1件でも失敗したらエラーを投げる。
export function useUploadClips() {
  return useMutation({
    mutationFn: ({
      projectId,
      items,
      onProgress,
    }: Variables): Promise<CompleteUploadResponse[]> => {
      // clipごとの進捗を保持し、更新のたびに平均を親へ通知する。
      // 各動画のサイズ差は無視してclip数で等分する。
      const ratios = new Array<number>(items.length).fill(0);

      return Promise.all(
        items.map((item, i) =>
          uploadOne(
            projectId,
            item,
            onProgress
              ? (ratio) => {
                  ratios[i] = ratio;
                  const total = ratios.reduce((a, b) => a + b, 0);
                  onProgress(total / items.length);
                }
              : undefined,
          ),
        ),
      );
    },
  });
}

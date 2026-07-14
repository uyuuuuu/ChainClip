import { File, UploadTask, UploadType } from "expo-file-system";

/**
 * 端末内の file:// URI をGCSの署名付きURLへPUTする。
 *
 * 注意: 署名付きURLは署名時に指定した Content-Type と一致必須。
 * upload-urls リクエストで送った contentType と同じ値を渡すこと。
 *
 * onProgress には 0〜1 の値が渡る。サーバーが Content-Length を返さない等で
 * 総バイト数が不明な場合は呼ばれない。
 */
export async function uploadToGcs(
  uploadUrl: string,
  fileUri: string,
  contentType: string,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  const file = new File(fileUri);

  const task = new UploadTask(file, uploadUrl, {
    httpMethod: "PUT",
    uploadType: UploadType.BINARY_CONTENT,
    headers: { "Content-Type": contentType },
    mimeType: contentType,
    onProgress: onProgress
      ? ({ bytesSent, totalBytes }) => {
          if (totalBytes > 0) onProgress(bytesSent / totalBytes);
        }
      : undefined,
  });

  // uploadAsync は非2xxでも解決するため、ステータスは自前で確認する
  const res = await task.uploadAsync();
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`GCSアップロードに失敗しました (${res.status}): ${res.body}`);
  }
}

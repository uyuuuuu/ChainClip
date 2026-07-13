/**
 * 端末内の file:// URI を Blob 化し、GCSの署名付きURLへPUTする。
 *
 * 注意: 署名付きURLは署名時に指定した Content-Type と一致必須。
 * upload-urls リクエストで送った contentType と同じ値を渡すこと。
 */
export async function uploadToGcs(
  uploadUrl: string,
  fileUri: string,
  contentType: string,
): Promise<void> {
  // 端末内URIを読み出して Blob 化する
  const fileRes = await fetch(fileUri);
  if (!fileRes.ok) {
    throw new Error(
      `ファイル読み込みに失敗しました (${fileRes.status}): ${fileUri}`,
    );
  }
  const blob = await fileRes.blob();

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!res.ok) {
    throw new Error(
      `GCSアップロードに失敗しました (${res.status}): ${await res.text()}`,
    );
  }
}

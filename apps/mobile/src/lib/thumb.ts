import * as VideoThumbnails from 'expo-video-thumbnails';
 
type Options = {
  attempts?: number; // リトライ回数(初回含む)
  quality?: number;  // 0.0〜1.0。低いほど生成が軽く速い
};
 
export async function getThumbWithRetry(
  uri: string,
  timeMs: number,
  { attempts = 3, quality = 0.5 }: Options = {},
): Promise<string> {
  if (attempts < 1) throw new Error('attempts must be at least 1');

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, {
        time: timeMs,
        quality,
      });
      return thumbUri;
    } catch (e) {
      lastError = e;
      if (i === attempts - 1) break;
      // 200ms → 400ms → 800ms と間隔を空けて再試行する
      const wait = 200 * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError;
}

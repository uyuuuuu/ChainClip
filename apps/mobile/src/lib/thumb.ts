// expo-video-thumbnails の getThumbnailAsync をリトライ付きで実行する

import * as VideoThumbnails from 'expo-video-thumbnails';

type Options = {
  attempts?: number; // リトライ回数
  quality?: number;  // 0.0〜1.0
};

export async function getThumbWithRetry(
  uri: string,
  timeMs: number,
  { attempts = 3, quality = 0.7 }: Options = {},
): Promise<string> {
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
      // 200ms → 400ms → 800ms と間隔を空けて再試行する
      const wait = 200 * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError;
}

// src/lib/localClips.ts
//
// 変換後mp4を端末のキャッシュに「一度だけ」ダウンロードして、
// 以降の再生・サムネイル生成には file:// のローカルURIを使うためのユーティリティ。
//
// 狙い:
// - ネットワーク越しのストリーミング再生をやめ、カット切替時の停止・再生中のラグをなくす
// - サムネイル生成(getThumbnailAsync)がネットワーク要因で失敗するのを防ぐ
// - プレーヤーA/B + サムネイル生成が同じURLを別々にダウンロードする帯域の無駄をなくす
//
// 注意: Expo SDK 54以降を使っている場合は、importを
//   import * as FileSystem from 'expo-file-system/legacy';
// に変更してください（SDK 54でFileSystem APIが刷新されたため）。

import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useRef, useState } from 'react';

// GET /projects/{id} のclipsのうち、ここで必要な部分だけの型
type ClipLike = { clipId: string; video: { url: string } };

export type LocalClipsState = {
  localUris: Record<string, string>;
  progress: number;
  done: boolean;
  failedClipIds: string[];
};

// キャッシュ置き場
const CLIP_DIR = `${FileSystem.cacheDirectory}clips/`;

const localPath = (clipId: string) => `${CLIP_DIR}${clipId}.mp4`;
const temporaryPath = (clipId: string) => `${CLIP_DIR}${clipId}.mp4.part`;
const inFlightDownloads = new Map<string, Promise<string>>();

async function ensureDir() {
  await FileSystem.makeDirectoryAsync(CLIP_DIR, { intermediates: true }).catch(() => {});
}

/**
 * 1本の変換後mp4をキャッシュへダウンロードする。
 * すでにキャッシュ済みなら通信せず即ローカルURIを返す。
 */
export async function ensureLocalClip(
  clipId: string,
  url: string,
  onProgress?: (ratio: number) => void
): Promise<string> {
  const existing = inFlightDownloads.get(clipId);
  if (existing) return existing;

  const task = downloadLocalClip(clipId, url, onProgress);
  inFlightDownloads.set(clipId, task);
  try {
    return await task;
  } finally {
    inFlightDownloads.delete(clipId);
  }
}

async function downloadLocalClip(
  clipId: string,
  url: string,
  onProgress?: (ratio: number) => void
): Promise<string> {
  const path = localPath(clipId);
  const tempPath = temporaryPath(clipId);
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists && (info.size ?? 0) > 0) {
    onProgress?.(1);
    return info.uri;
  }

  await ensureDir();
  // 中断ファイルを完成品として再利用しないよう、一時ファイルへ保存する。
  await FileSystem.deleteAsync(tempPath, { idempotent: true });
  const download = FileSystem.createDownloadResumable(url, tempPath, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) {
      onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    }
  });
  try {
    const result = await download.downloadAsync();
    if (!result) throw new Error(`download interrupted: ${clipId}`);
    const downloaded = await FileSystem.getInfoAsync(tempPath);
    if (!downloaded.exists || (downloaded.size ?? 0) <= 0) {
      throw new Error(`downloaded file is empty: ${clipId}`);
    }
    await FileSystem.moveAsync({ from: tempPath, to: path });
    return path;
  } catch (error) {
    await FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
    throw error;
  }
}

/** デバッグや容量対策用: キャッシュしたclipを全部消す */
export async function clearLocalClips() {
  await FileSystem.deleteAsync(CLIP_DIR, { idempotent: true });
}

/**
 * プロジェクトの全clipを1本ずつ順番にダウンロードして、
 * clipId -> file:// の対応表と進捗を返すフック。
 *
 * 使い方（scenes.tsx / editor.tsx 共通）:
 *   const { localUris, progress, done } = useLocalClips(project?.clips);
 *   // ダウンロードが終わるまでは署名URLで代用し、終わったらローカルに切り替える
 *   const videoUri = localUris[clipId] ?? clip.video.url;
 *
 * ポイント:
 * - 帯域を奪い合わないよう「直列」でダウンロードする
 * - 2回目以降の画面（editorなど）ではキャッシュ済みなので一瞬で done になる
 */
export function useLocalClips(clips: ClipLike[] | undefined): LocalClipsState {
  const [state, setState] = useState<LocalClipsState>({
    localUris: {},
    progress: 0,
    done: false,
    failedClipIds: [],
  });
  // 同じclipを二重にダウンロードしないための記録（画面の再レンダーでは消えない）
  const started = useRef(new Set<string>());
  // clipIdごとの進捗（全体進捗の計算用）
  const perClip = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!clips || clips.length === 0) return;
    let cancelled = false; // アンマウント後にsetStateしないためのフラグ

    const updateProgress = () => {
      const sum = clips.reduce((acc, c) => acc + (perClip.current[c.clipId] ?? 0), 0);
      if (!cancelled) {
        setState((s) => ({ ...s, progress: sum / clips.length }));
      }
    };

    const run = async () => {
      // まだ着手していないclipだけを対象にする
      const targets = clips.filter((c) => !started.current.has(c.clipId));
      targets.forEach((c) => started.current.add(c.clipId));

      for (const clip of targets) {
        if (cancelled) return;
        try {
          const uri = await ensureLocalClip(clip.clipId, clip.video.url, (r) => {
            perClip.current[clip.clipId] = r;
            updateProgress();
          });
          perClip.current[clip.clipId] = 1;
          if (!cancelled) {
            setState((s) => ({
              ...s,
              localUris: { ...s.localUris, [clip.clipId]: uri },
            }));
          }
        } catch (e) {
          console.warn('clipのダウンロードに失敗:', clip.clipId, e);
          started.current.delete(clip.clipId); // 次回のeffect実行でリトライできるように戻す
          if (!cancelled) {
            setState((s) => ({
              ...s,
              failedClipIds: [...new Set([...s.failedClipIds, clip.clipId])],
            }));
          }
        }
        updateProgress();
      }

      // 全clipがlocalUrisに揃っていればdone
      if (!cancelled) {
        setState((s) => ({
          ...s,
          done: clips.every((c) => s.localUris[c.clipId] != null || perClip.current[c.clipId] === 1),
        }));
      }
    };

    run();
    return () => {
      cancelled = true;
    };
    // clipsの参照が変わっても、started で二重ダウンロードは防がれる
  }, [clips]);

  return state;
}

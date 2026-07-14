import type { components } from '@/api/schema';

type ReadyClipResponse = components['schemas']['ReadyClipResponse'];
type SceneResponse = components['schemas']['SceneResponse'];

// editor / cutAdjustSheet が必要とする clip 情報。
// もとの mockClips.CLIP_MAP と同じ形だが、video はローカルmp4モジュールではなく
// サーバー発行の署名付きURL文字列(videoUrl)にしている。
export type ClipInfo = {
    clipId: string;
    clipIndex: number;
    durationMs: number;
    width: number;
    height: number;
    videoUrl: string;
    scenes: SceneResponse[];
};

export type ClipMap = Record<string, ClipInfo>;

// useProjectStatus の clips（ready時）から clipId 引きの対応表を作る。
export function buildClipMap(clips: ReadyClipResponse[] | null | undefined): ClipMap {
    if (!clips) return {};
    return Object.fromEntries(
        clips.map((clip) => [
            clip.clipId,
            {
                clipId: clip.clipId,
                clipIndex: clip.clipIndex,
                durationMs: clip.durationMs,
                width: clip.width,
                height: clip.height,
                videoUrl: clip.video.url,
                scenes: clip.scenes,
            } satisfies ClipInfo,
        ])
    );
}

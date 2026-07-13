import mov1 from '../../assets/videos/sample1.mp4';
import mov2 from '../../assets/videos/sample2.mp4';

export const CLIPS = [
    {
        clipId: 'clip-1',
        clipIndex: 0,
        durationMs: 14000,
        width: 1920,
        height: 1080,
        video: mov1, // 本来は { url: 'https://...signed...', expiresAt: '...' }
        scenes: [
            { sceneId: 'scene-1', sceneIndex: 0, startMs: 0, endMs: 3200, labels: ['Building', 'Tree', 'mountain'] },
            { sceneId: 'scene-2', sceneIndex: 1, startMs: 3200, endMs: 8500, labels: ['mountain'] },
            { sceneId: 'scene-3', sceneIndex: 2, startMs: 8500, endMs: 14000, labels: ['Building'] },
        ],
    },
    {
        clipId: 'clip-2',
        clipIndex: 1,
        durationMs: 13000,
        width: 1080,
        height: 1080,
        video: mov2,
        scenes: [
            { sceneId: 'scene-4', sceneIndex: 0, startMs: 0, endMs: 4000, labels: ['Tree', 'Person', 'Dog'] },
            { sceneId: 'scene-5', sceneIndex: 1, startMs: 4000, endMs: 13000, labels: ['Dog'] },
        ],
    },
];

// clipId → clip を素早く引けるようにした対応表
export const CLIP_MAP = Object.fromEntries(CLIPS.map((c) => [c.clipId, c])) as Record<
    string,
    (typeof CLIPS)[number]
>;

import * as Crypto from 'expo-crypto'; // RNにはcrypto.randomUUIDが無いのでこれを使う
import { create } from 'zustand';

// rotation: 時計回りの回転角(度)。90度刻みのみ許可
export type Rotation = 0 | 90 | 180 | 270;
export type Transform = { zoom: number; offsetX: number; offsetY: number; rotation: Rotation };

export type Cut = {
  cutId: string;
  clipId: string;
  sceneId: string;
  sceneStartMs: number;
  sceneEndMs: number;
  startMs: number;
  endMs: number;
  transform: Transform;
};

type SelectedScene = {
  sceneId: string;
  clipId: string;
  startMs: number;
  endMs: number;
};

type EditState = {
  // --- 状態 ---
  selectedScenes: SelectedScene[];
  timeline: Cut[];
  transition: 'none' | 'fade';
  cutSec: number;
  sceneThumbnails: Record<string, string>;
  cutThumbnails: Record<string, string>;

  // --- 状態を変更する関数(アクション) ---
  toggleScene: (scene: SelectedScene) => void;
  buildTimeline: () => void;
  updateCut: (cutId: string, patch: Partial<Pick<Cut, 'startMs' | 'endMs' | 'transform'>>) => void;
  moveCut: (from: number, to: number) => void;
  duplicateCut: (cutId: string) => void;
  removeCut: (cutId: string) => void;
  setTransition: (t: 'none' | 'fade') => void;
  setCutSec: (sec: number) => void;
  setSceneThumbnail: (sceneId: string, uri: string) => void;
  setCutThumbnail: (cutId: string, uri: string) => void;
  reset: () => void;
};

const DEFAULT_TRANSFORM: Transform = { zoom: 1.0, offsetX: 0, offsetY: 0, rotation: 0 };
const DEFAULT_CUT_SEC = 3;

export const useEditStore = create<EditState>()((set) => ({
  selectedScenes: [],
  timeline: [],
  transition: 'none',
  cutSec: DEFAULT_CUT_SEC,
  sceneThumbnails: {},
  cutThumbnails: {},

  // シーンの選択
  toggleScene: (scene) =>
    set((s) => {
      const exists = s.selectedScenes.some((x) => x.sceneId === scene.sceneId);
      return {
        selectedScenes: exists
          ? s.selectedScenes.filter((x) => x.sceneId !== scene.sceneId)
          : [...s.selectedScenes, scene],
      };
    }),

  // 選択シーンから初期タイムラインを作る
    buildTimeline: () =>
      set((s) => {
        const timeline = s.selectedScenes.map((scene) => ({
          cutId: Crypto.randomUUID(),
          clipId: scene.clipId,
          sceneId: scene.sceneId,
          sceneStartMs: scene.startMs,
          sceneEndMs: scene.endMs,
          startMs: scene.startMs,
          endMs: Math.min(scene.startMs + s.cutSec * 1000, scene.endMs),
          transform: { ...DEFAULT_TRANSFORM },
        }));
        // シーンのサムネを対応するカットに引き継ぐ(scenes.tsx → editor.tsxで作り直さない)
        const cutThumbnails: Record<string, string> = {};
        for (const cut of timeline) {
          const uri = s.sceneThumbnails[cut.sceneId];
          if (uri) cutThumbnails[cut.cutId] = uri;
        }
        return { timeline, cutThumbnails };
      }),

  // 切り抜き範囲・表示範囲の変更
  updateCut: (cutId, patch) =>
  set((s) => {
    const target = s.timeline.find((c) => c.cutId === cutId);
    const startMsChanged =
        target != null && patch.startMs != null && patch.startMs !== target.startMs;
        const cutThumbnails = { ...s.cutThumbnails };
        if (startMsChanged) {
            delete cutThumbnails[cutId];
        }
        return {
            timeline: s.timeline.map((c) => (c.cutId === cutId ? { ...c, ...patch } : c)),
            cutThumbnails,
        };
    }),

  // ドラッグで並び替え
  moveCut: (from, to) =>
    set((s) => {
      const next = [...s.timeline];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { timeline: next };
    }),

  // 複製(同じclipIdで別cutIdになる)
  duplicateCut: (cutId) =>
    set((s) => {
      const i = s.timeline.findIndex((c) => c.cutId === cutId);
      if (i === -1) return s;
        const newCutId = Crypto.randomUUID();
      const copy = { ...s.timeline[i], cutId: newCutId };
      const next = [...s.timeline];
      next.splice(i + 1, 0, copy);
      const originalThumb = s.cutThumbnails[cutId];
      const cutThumbnails = originalThumb
        ? { ...s.cutThumbnails, [newCutId]: originalThumb }
        : s.cutThumbnails;
      return { timeline: next, cutThumbnails };
    }),

    removeCut: (cutId) =>
      set((s) => {
        const cutThumbnails = { ...s.cutThumbnails };
        delete cutThumbnails[cutId];
        return {
            timeline: s.timeline.filter((c) => c.cutId !== cutId),
            cutThumbnails,
        };
    }),

  setSceneThumbnail: (sceneId, uri) =>
    set((s) => ({ sceneThumbnails: { ...s.sceneThumbnails, [sceneId]: uri } })),

  setCutThumbnail: (cutId, uri) =>
    set((s) => ({ cutThumbnails: { ...s.cutThumbnails, [cutId]: uri } })),

  setTransition: (t) => set({ transition: t }),

  // カット秒数を変更し、全カットの長さを引き直す
  setCutSec: (sec) =>
    set((s) => ({
      cutSec: sec,
      timeline: s.timeline.map((c) => ({
        ...c,
        endMs: Math.min(c.startMs + sec * 1000, c.sceneEndMs),
      })),
    })),

  // render送信成功後や新規プロジェクト開始時に必ず呼ぶ
  reset: () =>
    set({
      selectedScenes: [],
      timeline: [],
      transition: 'none',
      cutSec: DEFAULT_CUT_SEC,
      sceneThumbnails: {},
      cutThumbnails: {},
    }),
}));

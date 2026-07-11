import * as Crypto from 'expo-crypto'; // RNにはcrypto.randomUUIDが無いのでこれを使う
import { create } from 'zustand';

export type Transform = { zoom: number; offsetX: number; offsetY: number };

export type Cut = {
  cutId: string;
  clipId: string;
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

  // --- 状態を変更する関数(アクション) ---
  toggleScene: (scene: SelectedScene) => void;
  buildTimeline: () => void;
  updateCut: (cutId: string, patch: Partial<Pick<Cut, 'startMs' | 'endMs' | 'transform'>>) => void;
  moveCut: (from: number, to: number) => void;
  duplicateCut: (cutId: string) => void;
  removeCut: (cutId: string) => void;
  setTransition: (t: 'none' | 'fade') => void;
  reset: () => void;
};

const DEFAULT_TRANSFORM: Transform = { zoom: 1.0, offsetX: 0, offsetY: 0 };

export const useEditStore = create<EditState>()((set) => ({
  selectedScenes: [],
  timeline: [],
  transition: 'none',

  // シーンの選択状況
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
    set((s) => ({
      timeline: s.selectedScenes.map((scene) => ({
        cutId: Crypto.randomUUID(),
        clipId: scene.clipId,
        startMs: scene.startMs,
        endMs: scene.endMs,
        transform: { ...DEFAULT_TRANSFORM },
      })),
    })),

  // 切り抜き範囲・表示範囲の変更
  updateCut: (cutId, patch) =>
    set((s) => ({
      timeline: s.timeline.map((c) => (c.cutId === cutId ? { ...c, ...patch } : c)),
    })),

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
      const copy = { ...s.timeline[i], cutId: Crypto.randomUUID() };
      const next = [...s.timeline];
      next.splice(i + 1, 0, copy);
      return { timeline: next };
    }),

  removeCut: (cutId) =>
    set((s) => ({ timeline: s.timeline.filter((c) => c.cutId !== cutId) })),

  setTransition: (t) => set({ transition: t }),

  // render送信成功後や新規プロジェクト開始時に必ず呼ぶ
  reset: () => set({ selectedScenes: [], timeline: [], transition: 'fade' }),
}));
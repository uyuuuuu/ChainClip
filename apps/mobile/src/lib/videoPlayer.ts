type PausablePlayer = {
  pause: () => void;
};

/**
 * expo-videoのSharedObjectは画面破棄時にhook側で先に解放される場合がある。
 * フォーカスcleanupなど、解放処理と競合し得る場所から安全に停止する。
 */
export function pauseVideoPlayerSafely(player: PausablePlayer): void {
  try {
    player.pause();
  } catch {
    // 既にnative shared objectが解放済みなら、停止という目的は達成されている。
  }
}

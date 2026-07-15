import CutAdjustSheet from '@/components/ui/cutAdjustSheet';
import { GradientButton } from '@/components/ui/gradientButton';
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import { useProjectStatus } from '@/hooks/useProjectStatus';
import { buildClipMap, type ClipMap } from '@/lib/clipMap';
import { useLocalClips } from '@/lib/localClips';
import { useEditStore, type Cut } from '@/stores/editStore';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, GestureResponderEvent, Image, Pressable, Switch, View } from 'react-native';
import DraggableFlatList, { useOnCellActiveAnimation, type RenderItemParams } from 'react-native-draggable-flatlist';
import Reanimated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as VideoThumbnails from 'expo-video-thumbnails';

// 2つのプレーヤーの識別子
// 表: いま画面に見えている方 / 裏: 次のカットを先読みしておく方
// 先読みをさせることで、別動画の読み込み時間を削減してラグを防ぐ
type PlayerKey = 'A' | 'B';

// サムネイルのキー(clipId:startMs)
const thumbKey = (cut: { clipId: string; startMs: number }) => `${cut.clipId}:${cut.startMs}`;

// カットがどのシーン由来かを clipId と開始位置から逆引きして、ラベルを取り出す
// （storeのCutはラベルを持っていないため）
const findLabels = (cut: Cut, clipMap: ClipMap): string[] => {
    const scene = clipMap[cut.clipId]?.scenes.find((s) => s.sceneId === cut.sceneId);
    return scene ? [...new Set(scene.labels)] : [];
};

// ビデオプレーヤーによって映す位置
const videoLayoutFor = (cut: Cut | null, containerSize: number, clipMap: ClipMap) => {
    const clip = cut ? clipMap[cut.clipId] : undefined;
    if (!cut || !clip || !containerSize) {
        // 計算できないうちはコンテナいっぱいに表示しておく
        return { width: '100%' as const, height: '100%' as const, left: 0, top: 0, rotation: 0 as const };
    }
    const { width: W, height: H } = clip;
    const { zoom, offsetX, offsetY, rotation } = cut.transform;

    // 90/270度回転時は、切り抜き計算上の縦横が入れ替わる(cutAdjustSheetの計算と揃える)
    const swapped = rotation === 90 || rotation === 270;
    const eW = swapped ? H : W;
    const eH = swapped ? W : H;

    // 切り抜く正方形の一辺(実効ピクセル)
    const cropSide = Math.min(eW, eH) / zoom;
    // 実効ピクセル → 画面px の倍率。「切り抜き正方形 = コンテナの一辺」になるように
    const scale = containerSize / cropSide;

    // 切り抜き正方形の左上(実効ピクセル)
    const cropLeft = (0.5 + offsetX) * eW - cropSide / 2;
    const cropTop = (0.5 + offsetY) * eH - cropSide / 2;

    return {
        // VideoView自体は回転前の実サイズのまま描画し、見た目だけCSSのrotateで回す
        width: W * scale,
        height: H * scale,
        left: -cropLeft * scale, // 切り抜き位置がコンテナの左上に来るよう、動画をマイナス方向へずらす
        top: -cropTop * scale,
        rotation,
    };
};

// 時間表示（秒 → 00:00:00）
const formatTime = (seconds: number): string => {
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

// カットの長さ表示（ミリ秒 → 00:03）
const formatBadge = (ms: number): string => {
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(m)}:${pad(s)}`;
};

// ドラッグ中に少し拡大して持ち上げる
const CutScaleDecorator = ({ children }: { children: ReactNode }) => {
    const { isActive, onActiveAnim } = useOnCellActiveAnimation();
    const style = useAnimatedStyle(() => {
        // 1 → 1.06 倍に拡大する
        const scale = isActive ? interpolate(onActiveAnim.value, [0, 1], [1, 1.06]) : 1;
        return { transform: [{ scaleX: scale }, { scaleY: scale }] };
    }, [isActive]);
    return <Reanimated.View style={style}>{children}</Reanimated.View>;
};

export default function EditorScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();

    const { localUris } = useLocalClips(project?.clips);

    const { data: project } = useProjectStatus(id);
    const clipMap = useMemo<ClipMap>(() => buildClipMap(project?.clips), [project?.clips]);

    /* Zustand: タイムラインの状態 */
    const timeline = useEditStore((s) => s.timeline);
    const transition = useEditStore((s) => s.transition);
    const setTransition = useEditStore((s) => s.setTransition);
    const cutSec = useEditStore((s) => s.cutSec);
    const setCutSec = useEditStore((s) => s.setCutSec);
    const duplicateCut = useEditStore((s) => s.duplicateCut);
    const removeCut = useEditStore((s) => s.removeCut);
    const moveCut = useEditStore((s) => s.moveCut);

    // 遷移直後の最初のカット
    const firstCut = timeline[0];

    // Aが表・Bが裏で始まり、カットが切り替わるたびに役割を交代する。
    // 初期ソースは持たない（clipMapが揃ってから loadCutInto で読み込む）。
    const playerA = useVideoPlayer(null, (p) => {
        p.timeUpdateEventInterval = 0.25; // 再生位置イベントを0.25秒ごとに発火
        p.loop = false;
    });
    const playerB = useVideoPlayer(null, (p) => {
        p.timeUpdateEventInterval = 0.25;
        p.loop = false;
    });
    const getPlayer = (key: PlayerKey) => (key === 'A' ? playerA : playerB);

    // 現在表示されているプレーヤー
    const [activeKey, setActiveKey] = useState<PlayerKey>('A');
    // 各プレーヤーにどのカットが載っているか
    const [shownCuts, setShownCuts] = useState<Record<PlayerKey, Cut | null>>({
        A: firstCut ?? null,
        B: null,
    });
    // 正方形コンテナの実際の一辺(px)
    const [playerSize, setPlayerSize] = useState(0);
    // 読み込みできているかどうか（同期エラー防ぎ）
    const [isReady, setIsReady] = useState(false);
    // 再生されているかどうか
    const [isPlaying, setIsPlaying] = useState(false);
    // タイムライン全体での経過時間（ミリ秒）
    const [elapsedMs, setElapsedMs] = useState(0);
    // シークバーの実際の幅(px)
    const [barWidth, setBarWidth] = useState(0);
    // ミュート
    const [muted, setMuted] = useState(false);
    // 歯車の設定ポップアップの開閉
    const [showSettings, setShowSettings] = useState(false);
    // カット秒数の選択肢ポップアップの開閉
    const [showCutSecMenu, setShowCutSecMenu] = useState(false);
    // いまプレビュー再生の対象になっているカット
    const [playingCutId, setPlayingCutId] = useState<string | null>(firstCut?.cutId ?? null);
    // タップで選択中のカット
    const [selectedCutId, setSelectedCutId] = useState<string | null>(firstCut?.cutId ?? null);
    // カット編集シートの表示
    const [showCropSheet, setShowCropSheet] = useState(false);
    /* サムネイル（キーは clipId:startMs） */
    const [thumbs, setThumbs] = useState<Record<string, string>>({});

    // イベントリスナーから最新値を読む用のref
    const timelineRef = useRef(timeline);
    const activeKeyRef = useRef<PlayerKey>('A');
    const playingCutIdRef = useRef<string | null>(firstCut?.cutId ?? null);
    // いま各プレーヤーに読み込まれている元動画
    const loadedClip = useRef<Record<PlayerKey, string | null>>({
        A: null,
        B: null,
    });
    // 読み込み完了後にシークするもの
    const pendingSeek = useRef<Record<PlayerKey, { seekMs: number; resolve: () => void } | null>>({
        A: null,
        B: null,
    });
    // 先読みが完了しているカットのID
    const prepared = useRef<Record<PlayerKey, string | null>>({ A: null, B: null });
    // 次カットへの切り替え処理の多重実行防止
    const advancing = useRef(false);
    // シーク直後に届く「古い再生位置」のイベントを無視する期限
    const ignoreTimeUpdateUntil = useRef(0);

    // カットを指定したプレーヤーに読み込む
    const loadCutInto = (key: PlayerKey, cut: Cut, seekMs = cut.startMs) =>
        new Promise<void>((resolve) => {
            const player = getPlayer(key);
            const clip = clipMap[cut.clipId];
            if (!clip) {
                resolve();
                return;
            }
            // このプレーヤーに載るカットを記録
            setShownCuts((prev) => ({ ...prev, [key]: cut }));
            // 新しい読み込みを始めた時点で、以前の先読み完了記録を無効に
            prepared.current[key] = null;
            if (loadedClip.current[key] === cut.clipId && player.status === 'readyToPlay') {
                // 読み込み済みの同じ元動画ならすぐにシーク
                player.currentTime = seekMs / 1000;
                resolve();
                return;
            }
            // 差し替え直後・読み込み中はシークできないので位置を予約
            pendingSeek.current[key] = { seekMs, resolve };
            if (loadedClip.current[key] !== cut.clipId) {
                loadedClip.current[key] = cut.clipId;
                const uri = localUris[cut.clipId] ?? clip.videoUrl;
                player.replaceAsync(uri).catch((e) => {
                    console.warn('動画の差し替えが中断されました:', e);
                });
            }
        });

    // 表のプレーヤーでカットを表示する
    const showCutOnActive = async (cut: Cut, opts: { autoplay: boolean; seekMs?: number }) => {
        const key = activeKeyRef.current;
        const other: PlayerKey = key === 'A' ? 'B' : 'A';

        playingCutIdRef.current = cut.cutId;
        setPlayingCutId(cut.cutId);
        ignoreTimeUpdateUntil.current = Date.now() + 300;

        // 裏のプレーヤーは止める
        getPlayer(other).pause();

        await loadCutInto(key, cut, opts.seekMs ?? cut.startMs);
        if (opts.autoplay) getPlayer(key).play();
        else getPlayer(key).pause();

        // 次のカットを裏のプレーヤーに先読み
        prepareNext();
    };

    // 次のカットを「裏」のプレーヤーに先読みしておく（動画切り替え時のラグ対策）
    const prepareNext = async () => {
        if (advancing.current) return; // 切り替え中はadvance側に任せる
        const list = timelineRef.current;
        const idx = list.findIndex((c) => c.cutId === playingCutIdRef.current);
        const next = idx >= 0 ? list[idx + 1] : undefined;
        if (!next) return; // 最後のカット再生中なら先読みするものはない

        const standbyKey: PlayerKey = activeKeyRef.current === 'A' ? 'B' : 'A';
        if (prepared.current[standbyKey] === next.cutId) return; // 先読み済み

        await loadCutInto(standbyKey, next); // 読み込み＆シーク完了まで待つ
        prepared.current[standbyKey] = next.cutId; // 完了を記録
    };

    // 次のカットへ進む
    const advance = async () => {
        if (advancing.current) return;
        advancing.current = true;
        try {
            const list = timelineRef.current;
            const idx = list.findIndex((c) => c.cutId === playingCutIdRef.current);
            const next = idx >= 0 ? list[idx + 1] : undefined;
            const oldKey = activeKeyRef.current;
            const oldPlayer = getPlayer(oldKey);

            if (!next) {
                // 最後のカットまで再生し終えたら再生停止
                oldPlayer.pause();
                return;
            }

            // 次のカットを裏のプレーヤーに読み込み
            const newKey: PlayerKey = oldKey === 'A' ? 'B' : 'A';
            const newPlayer = getPlayer(newKey);
            if (prepared.current[newKey] !== next.cutId) {
                await loadCutInto(newKey, next);
            }
            prepared.current[newKey] = null;

            // 表裏を瞬時に交代して次のカットの再生を始める
            playingCutIdRef.current = next.cutId;
            setPlayingCutId(next.cutId);
            ignoreTimeUpdateUntil.current = Date.now() + 300;
            activeKeyRef.current = newKey;
            setActiveKey(newKey); // 表になったプレーヤーだけが画面に見える

            newPlayer.play();
            oldPlayer.pause(); // 前のカット側は裏に回して停止
        } finally {
            advancing.current = false;
        }

        // その次のカットを先読み
        prepareNext();
    };

    // 並び替え・複製・削除など
    useEffect(() => {
        timelineRef.current = timeline;
        // 次のカットが変わった可能性があるので先読みし直し
        prepareNext();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeline]);

    // プレーヤーの状態をUIに反映
    useEffect(() => {
        const subs: { remove: () => void }[] = [];

        (['A', 'B'] as const).forEach((key) => {
            const player = getPlayer(key);

            subs.push(
                player.addListener('playingChange', ({ isPlaying }) => {
                    if (key === activeKeyRef.current) setIsPlaying(isPlaying);
                })
            );

            subs.push(
                player.addListener('statusChange', ({ status }) => {
                    if (key === activeKeyRef.current) setIsReady(status === 'readyToPlay');
                    // 予約されたシークがあれば実行し、待っているPromiseを解決
                    const pending = pendingSeek.current[key];
                    if (status === 'readyToPlay' && pending) {
                        player.currentTime = pending.seekMs / 1000;
                        pendingSeek.current[key] = null;
                        pending.resolve();
                    }
                })
            );

            subs.push(
                player.addListener('timeUpdate', ({ currentTime }) => {
                    if (key !== activeKeyRef.current) return; // 裏のプレーヤーは無視
                    if (advancing.current) return;
                    if (Date.now() < ignoreTimeUpdateUntil.current) return;

                    const list = timelineRef.current;
                    const idx = list.findIndex((c) => c.cutId === playingCutIdRef.current);
                    if (idx === -1) return;
                    const cut = list[idx];

                    const startSec = cut.startMs / 1000;
                    const endSec = cut.endMs / 1000;
                    const lengthSec = endSec - startSec;

                    // 「前のカットの合計」+「カット内の経過」= タイムライン全体の経過時間
                    const beforeMs = list
                        .slice(0, idx)
                        .reduce((sum, c) => sum + (c.endMs - c.startMs), 0);
                    const relSec = Math.min(Math.max(currentTime - startSec, 0), lengthSec);
                    setElapsedMs(beforeMs + relSec * 1000);

                    // カットの終わりに達したら、自動的に次のカットへ
                    if (currentTime >= endSec) {
                        advance();
                    }
                })
            );

            // 動画ファイル自体の終端に達した場合
            subs.push(
                player.addListener('playToEnd', () => {
                    if (key === activeKeyRef.current) advance();
                })
            );
        });

        return () => subs.forEach((s) => s.remove());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // clipMap が揃ったら先頭カットをプレビューに読み込む（一度だけ）。
    // clips 取得は非同期なので、mount 時点では clipMap が空のことがある。
    const didInitialLoad = useRef(false);
    useEffect(() => {
        if (didInitialLoad.current) return;
        if (Object.keys(clipMap).length === 0) return; // まだclips未取得
        const first = useEditStore.getState().timeline[0];
        if (first) {
            didInitialLoad.current = true;
            showCutOnActive(first, { autoplay: false });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clipMap]);

    // サムネイル生成
    const generatedKeys = useRef(new Set<string>());
        
    useEffect(() => {
        let cancelled = false; // 画面を離れた後にsetStateしないためのフラグ

        const generate = async () => {
            for (const cut of timeline) {
                const key = thumbKey(cut);
                if (generatedKeys.current.has(key)) continue;

                const clip = clipMap[cut.clipId];
                if (!clip) continue; // clipMap未取得。次回(clipMap更新)にリトライさせるため記録しない
                const localUri = localUris[cut.clipId];
                if (!localUri) continue;
                generatedKeys.current.add(key);
                try {
                    if (cancelled) return;
                    const { uri } = await VideoThumbnails.getThumbnailAsync(localUri, {
                        time: scene.startMs,
                    });
                    if (!cancelled) {
                        setThumbs((prev) => ({ ...prev, [key]: uri }));
                    }
                } catch (e) {
                    generatedKeys.current.delete(key); // 失敗したら次回リトライできるように戻す
                    console.warn('サムネイル生成に失敗:', e);
                }
            }
        };

        generate();
        return () => {
            cancelled = true;
        };
    }, [timeline, clipMap, localUris]);

    // 再生/停止の切り替え
    const togglePlay = () => {
        const active = getPlayer(activeKeyRef.current);
        if (isPlaying) {
            active.pause();
            return;
        }
        if (timeline.length === 0) return;

        const idx = timeline.findIndex((c) => c.cutId === playingCutIdRef.current);
        if (idx === -1) {
            // 再生対象を見失っている場合（削除直後など）、先頭から再生
            setElapsedMs(0);
            showCutOnActive(timeline[0], { autoplay: true });
            return;
        }
        const cut = timeline[idx];
        const isLast = idx === timeline.length - 1;
        // 最後のカットの終端(誤差0.05秒許容)で止まっている場合、先頭から再生
        if (isLast && active.currentTime >= cut.endMs / 1000 - 0.05) {
            setElapsedMs(0);
            showCutOnActive(timeline[0], { autoplay: true });
            return;
        }
        active.play();
    };

    // シークバーがタップされたら、タイムライン全体の位置として再生位置を変える
    const handleSeek = (e: GestureResponderEvent) => {
        const totalMs = timeline.reduce((sum, c) => sum + (c.endMs - c.startMs), 0);
        if (!barWidth || totalMs <= 0) return;

        const ratio = Math.min(Math.max(e.nativeEvent.locationX / barWidth, 0), 1);
        const wasPlaying = getPlayer(activeKeyRef.current).playing;

        // バーの0〜100%を「どのカットの何ms地点か」に変換する
        let rest = ratio * totalMs;
        for (let i = 0; i < timeline.length; i++) {
            const cut = timeline[i];
            const len = cut.endMs - cut.startMs;
            if (rest <= len || i === timeline.length - 1) {
                showCutOnActive(cut, {
                    autoplay: wasPlaying,
                    seekMs: cut.startMs + Math.min(rest, len),
                });
                break;
            }
            rest -= len;
        }
        setElapsedMs(ratio * totalMs); // UIに即反映
    };

    // タイムラインのカットをタップ
    const handleSelectCut = (cut: Cut) => {
        setSelectedCutId(cut.cutId);

        // シークバーをこのカットの先頭位置に合わせる（前のカットの合計時間 = このカットの開始位置）
        const idx = timeline.findIndex((c) => c.cutId === cut.cutId);
        const beforeMs = timeline
            .slice(0, idx)
            .reduce((sum, c) => sum + (c.endMs - c.startMs), 0);
        setElapsedMs(beforeMs);

        // プレーヤーに読み込んで即再生
        showCutOnActive(cut, { autoplay: true });
    };

    // カット編集シートを開く
    const handleOpenCropSheet = () => {
        if (!selectedCut) return;
        getPlayer(activeKeyRef.current).pause(); // 背面のプレビューを止める
        setShowCropSheet(true);
    };

    // カット編集シートを閉じる
    const handleCloseCropSheet = (lastCutId: string) => {
        setShowCropSheet(false);
        setSelectedCutId(lastCutId); // シートで最後に選択していたカットを選択状態にする

        //編集内容をstoreへ保存した後、プレビューへ読み込み直す
        setTimeout(() => {
            const list = useEditStore.getState().timeline;
            const idx = list.findIndex((c) => c.cutId === lastCutId);
            if (idx === -1) return;
            const beforeMs = list.slice(0, idx).reduce((sum, c) => sum + (c.endMs - c.startMs), 0);
            setElapsedMs(beforeMs);
            showCutOnActive(list[idx], { autoplay: false });
        }, 0);
    };

    // 複製（storeが選択カットの直後に同じ内容(別cutId)を挿入）
    const handleDuplicate = () => {
        if (!selectedCut) return;
        duplicateCut(selectedCut.cutId);
    };

    // 削除（選択とプレビューの整合を取りながらstoreから消す）
    const handleRemove = () => {
        if (!selectedCut) return;
        const idx = timeline.findIndex((c) => c.cutId === selectedCut.cutId);
        const next = timeline.filter((c) => c.cutId !== selectedCut.cutId);

        removeCut(selectedCut.cutId);

        // 選択を隣のカットへ移す
        const neighbor = next[Math.min(idx, next.length - 1)] ?? null;
        setSelectedCutId(neighbor?.cutId ?? null);

        // 削除したカットをちょうど再生していた場合は、隣のカットを読み込み直す
        if (playingCutIdRef.current === selectedCut.cutId) {
            getPlayer(activeKeyRef.current).pause();
            if (neighbor) {
                showCutOnActive(neighbor, { autoplay: false });
                const nIdx = next.findIndex((c) => c.cutId === neighbor.cutId);
                const beforeMs = next
                    .slice(0, nIdx)
                    .reduce((sum, c) => sum + (c.endMs - c.startMs), 0);
                setElapsedMs(beforeMs);
            } else {
                playingCutIdRef.current = null;
                setPlayingCutId(null);
                setElapsedMs(0);
            }
        }
    };

    // 選択中のカット
    const selectedCut = timeline.find((c) => c.cutId === selectedCutId) ?? null;
    // タイムライン全体の長さ
    const totalMs = timeline.reduce((sum, c) => sum + (c.endMs - c.startMs), 0);
    // シークバー
    const progressValue = totalMs > 0 ? Math.min((elapsedMs / totalMs) * 100, 100) : 0;

    // タイムラインの1カット分の描画
    // item: このカットのデータ / drag: ドラッグする関数 / isActive: いまドラッグ中かどうか / getIndex: 現在の並び位置
    const renderCutItem = ({ item: cut, drag, isActive, getIndex }: RenderItemParams<Cut>) => {
        const index = getIndex() ?? 0;
        const isSelected = cut.cutId === selectedCutId;
        const isPreviewing = cut.cutId === playingCutId && isPlaying;
        const thumb = thumbs[thumbKey(cut)];
        return (
            // ドラッグ中に少し拡大
            <CutScaleDecorator>
                <View className="flex-row items-center">
                    <View
                        className={`h-[2px] w-4 ${index > 0 && !isActive ? 'bg-gray-300' : 'bg-transparent'}`}
                    />
                    <Pressable
                        onPress={() => handleSelectCut(cut)}
                        disabled={isActive}
                        className={`overflow-hidden rounded-lg ${isSelected ? 'border-2 border-primary' : ''}`}
                    >
                        {/* サムネイル */}
                        {thumb ? (
                            <Image
                                source={{ uri: thumb }}
                                style={{ width: 80, height: 80 }}
                                resizeMode="cover"
                            />
                        ) : (
                            <View style={{ width: 80, height: 80 }} className="bg-slate-200" />
                        )}
                        {/* 並び替え用ハンドル */}
                        <Pressable
                            onLongPress={drag}
                            delayLongPress={150}
                            disabled={isActive}
                            hitSlop={6}
                            className="absolute right-1 top-1 rounded bg-white/80 p-0.5"
                        >
                            <MaterialCommunityIcons name="menu" size={14} color="#525252" />
                        </Pressable>
                        {/* カットの長さ */}
                        <View className="absolute bottom-1 right-1 rounded bg-black/70 px-1">
                            <Text className="text-[10px] text-white">
                                {formatBadge(cut.endMs - cut.startMs)}
                            </Text>
                        </View>
                        {/* プレビュー再生中のオーバーレイ */}
                        {isPreviewing && (
                            <View className="absolute inset-0 items-center justify-center bg-black/50">
                                <Text className="font-bold text-white">再生中</Text>
                            </View>
                        )}
                    </Pressable>
                </View>
            </CutScaleDecorator>
        );
    };

    // プロジェクトIDがそもそも無い場合、プロジェクト作成画面へ誘導
    if (!id) {
        return (
            <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-white">
                <Text className="text-gray-500">プロジェクトが存在しません</Text>
                <Pressable
                    onPress={() => router.replace('/project/create')}
                    className="rounded-lg bg-primary px-6 py-2"
                >
                    <Text className="font-bold text-white">プロジェクト作成に戻る</Text>
                </Pressable>
            </SafeAreaView>
        );
    }

    // idはあるが、シーンを1つも選ばずに来た場合、シーン選択画面へ誘導
    if (timeline.length === 0) {
        return (
            <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-white">
                <Text className="text-gray-500">カットが選択されていません</Text>
                <Pressable
                    onPress={() =>
                        router.replace({ pathname: '/project/[id]/scenes', params: { id } })
                    }
                    className="rounded-lg bg-primary px-6 py-2"
                >
                    <Text className="font-bold text-white">シーン選択に戻る</Text>
                </Pressable>
            </SafeAreaView>
        );
    }

    // 設定ポップアップを閉じる（サブメニューも一緒に）
    const closeSettings = () => {
        setShowSettings(false);
        setShowCutSecMenu(false);
    };

    return (
        <SafeAreaView className="w-full flex-1 bg-white">
            {/* ポップアップの外側をタップしたら閉じるための透明な層 */}
            {showSettings && (
                <Pressable
                    className="absolute inset-0 z-[5]"
                    onPress={closeSettings}
                />
            )}
            {/* ヘッダー */}
            <View className="h-16 flex-row items-center justify-center">
                <Pressable onPress={() => router.back()} className="absolute left-2 p-2">
                    <MaterialCommunityIcons name="chevron-left" size={40} color="#262626" />
                </Pressable>
                <Text className="text-base font-bold">動画を編集</Text>
                <GradientButton
                    label="生成"
                    onPress={() =>
                        router.push({
                            pathname: '/project/[id]/output',
                            params: { id }
                        })}
                    textStyle={{ fontSize: 16 }}
                    buttonStyle={{ paddingVertical: 8, paddingHorizontal: 24 }}
                    style={{ position: 'absolute', right: 16 }}
                />
            </View>

            {/* ビデオプレーヤー */}
            <View
                className="flex-1 items-center justify-center"
                onLayout={(e) => {
                    const { width, height } = e.nativeEvent.layout;
                    // 横は左右の余白(24pxずつ)を引いた幅まで、縦は使える高さまで。小さい方に合わせる
                    setPlayerSize(Math.max(0, Math.floor(Math.min(width - 48, height))));
                }}
            >
                <View
                    className="bg-black overflow-hidden rounded-xl"
                    style={{ width: playerSize, height: playerSize }}
                >
                    {(['A', 'B'] as const).map((key) => {
                        const layout = videoLayoutFor(shownCuts[key], playerSize, clipMap);
                        const isFront = activeKey === key;
                        return (
                            <View
                                key={key}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    opacity: isFront ? 1 : 0, // 裏は完全に見えない
                                    zIndex: isFront ? 2 : 1, // 表を手前に
                                }}
                            >
                                <VideoView
                                    player={getPlayer(key)}
                                    style={{
                                        position: 'absolute',
                                        width: layout.width,
                                        height: layout.height,
                                        left: layout.left,
                                        top: layout.top,
                                        transform: [{ rotate: `${layout.rotation}deg` }],
                                    }}
                                    contentFit="fill"
                                    nativeControls={false}
                                />
                            </View>
                        );
                    })}
                </View>
            </View>
            {/* 歯車を閉じる用の透明な層より前面に出すため z-10 */}
            <View className="h-8 my-2 z-10 flex-row items-center justify-center gap-2">
                {/* 再生ボタン */}
                <Pressable onPress={togglePlay} hitSlop={8}>
                    <MaterialCommunityIcons
                        name={isPlaying ? 'pause' : 'play'}
                        size={32}
                        color="#262626"
                    />
                </Pressable>
                <View
                    className="relative w-9/12"
                    onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
                >
                    {/* 時間表示 */}
                    <Text className="absolute bottom-4 left-0 text-[10px] text-gray-500">
                        {formatTime(elapsedMs / 1000)} / {formatTime(totalMs / 1000)}
                    </Text>
                    {/* シークバー */}
                    <Pressable
                        className="py-2"
                        onPress={isReady ? handleSeek : undefined}
                        style={{ opacity: isReady ? 1 : 0.4 }}
                    >
                        <Progress className="h-1.5 w-full" value={progressValue} />
                    </Pressable>
                </View>
                {/* 設定（歯車） */}
                <Pressable onPress={() => {
                    setShowSettings((v) => !v);
                    setShowCutSecMenu(false);// 設定を閉じる時はサブメニューも閉じる
                }}
                    hitSlop={8}>
                    <MaterialCommunityIcons name="cog" size={26} color="#262626" />
                </Pressable>
            </View>
            <View className="mt-2 flex-row items-center px-6">
                {/* 設定ポップアップ */}
                {showSettings && (
                    <View
                        className="absolute bottom-10 right-4 z-10 w-60 rounded-xl bg-white p-3 shadow-md shadow-black/20"
                        style={{ elevation: 8 }}
                    >
                        {/* カット秒数 */}
                        <Pressable
                            className="h-9 flex-row items-center justify-between"
                            onPress={() => setShowCutSecMenu((v) => !v)}
                        >
                            <Text className="text-sm">カット秒数</Text>
                            <View className="flex-row items-center">
                                <Text className="text-sm text-gray-500">{cutSec}秒</Text>
                                <MaterialCommunityIcons name="chevron-right" size={18} color="#9ca3af" />
                            </View>
                        </Pressable>
                        <View className="h-9 flex-row items-center justify-between">
                            <Text className="text-sm">音声をミュート</Text>
                            <Switch
                                value={muted}
                                onValueChange={(v) => {
                                    setMuted(v);
                                    // 2つのプレーヤー両方に反映
                                    playerA.muted = v;
                                    playerB.muted = v;
                                }}
                                trackColor={{ true: '#22d3ee' }}
                                // Switchはサイズ指定ができないので縮小して合わせる
                                style={{ transform: [{ scale: 0.8 }] }}
                            />
                        </View>
                        <View className="h-9 flex-row items-center justify-between">
                            <Text className="text-sm">フェード</Text>
                            {/* store(editStore)のtransitionに保存する */}
                            <Switch
                                value={transition === 'fade'}
                                onValueChange={(v) => setTransition(v ? 'fade' : 'none')}
                                trackColor={{ true: '#22d3ee' }}
                                style={{ transform: [{ scale: 0.8 }] }}
                            />
                        </View>
                    </View>
                )}

                {/* カット秒数の選択肢ポップアップ */}
                {showSettings && showCutSecMenu && (
                    <View
                        className="absolute bottom-36 right-14 z-20 w-28 rounded-xl bg-white p-2 shadow-md shadow-black/20"
                        style={{ elevation: 9 }}
                    >
                        {[3, 5, 10].map((sec) => (
                            <Pressable
                                key={sec}
                                onPress={() => {
                                    setCutSec(sec);
                                    setShowCutSecMenu(false);
                                }}
                                className="h-9 flex-row items-center justify-between px-2"
                            >
                                <Text
                                    className={`text-sm ${cutSec === sec ? 'font-bold text-primary' : 'text-[#262626]'}`}
                                >
                                    {sec}秒
                                </Text>
                                {cutSec === sec && (
                                    <MaterialCommunityIcons name="check" size={16} color="#22d3ee" />
                                )}
                            </Pressable>
                        ))}
                    </View>
                )}
            </View>

            <View className="pb-2">
                {/* 並び替えヒント */}
                <View className="mt-2 px-6 flex-row items-center justify-end gap-1">
                    <MaterialCommunityIcons name="lightbulb-on-outline" size={13} color="#9ca3af" />
                    <Text className="text-[11px] text-gray-400">
                        ハンドルを掴んで並び替えられます
                    </Text>
                </View>

                {/* タイムライン */}
                <DraggableFlatList
                    horizontal
                    data={timeline}
                    keyExtractor={(c) => c.cutId}
                    renderItem={renderCutItem}
                    // ドラッグを離した時に呼ばれる。storeの並び順を更新する
                    onDragEnd={({ from, to }) => moveCut(from, to)}
                    extraData={[selectedCutId, playingCutId, isPlaying, thumbs]}
                    showsHorizontalScrollIndicator={false}
                    style={{ flexGrow: 0, marginTop: 4 }}
                    contentContainerStyle={{
                        alignItems: 'center',
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                    }}
                />

                {/* 選択中カットの詳細カード */}
                {selectedCut && (
                    <View className="mx-4 mt-4 gap-3 rounded-2xl border border-gray-200 bg-white p-4">
                        <View className="flex-row items-center gap-3">
                            {/* サムネイル */}
                            <View className="relative">
                                {thumbs[thumbKey(selectedCut)] ? (
                                    <Image
                                        source={{ uri: thumbs[thumbKey(selectedCut)] }}
                                        style={{ width: 84, height: 84 }}
                                        className="rounded-md"
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <View
                                        style={{ width: 84, height: 84 }}
                                        className="rounded-md bg-slate-200"
                                    />
                                )}
                                <View className="absolute bottom-1 right-1 rounded bg-black/70 px-1">
                                    <Text className="text-[10px] text-white">
                                        {formatBadge(selectedCut.endMs - selectedCut.startMs)}
                                    </Text>
                                </View>
                            </View>
                            {/* ラベル */}
                            <View className="flex-1 flex-row flex-wrap gap-2">
                                {findLabels(selectedCut, clipMap).slice(0, 3).map((tag) => (
                                    <View
                                        key={tag}
                                        className="rounded-md bg-slate-200 px-2.5 py-0.5 shadow-md shadow-gray-100"
                                    >
                                        <Text className="text-xs font-semibold text-[#262626]" numberOfLines={1}>
                                            {tag}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </View>

                        {/* 切りぬきを調整 */}
                        <Pressable
                            className="items-center rounded-lg bg-primary py-2"
                            onPress={handleOpenCropSheet}
                        >
                            <View className="flex-row items-center gap-2">
                                <MaterialCommunityIcons name="content-cut" size={18} color="white" />
                                <Text className="font-bold text-white">切りぬきを調整</Text>
                            </View>
                            <Text className="text-[10px] text-white/90">
                                カットの開始時間・表示範囲を変更
                            </Text>
                        </Pressable>

                        {/* 複製・削除 */}
                        <View className="flex-row gap-3">
                            <Pressable
                                onPress={handleDuplicate}
                                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-gray-300 py-2"
                            >
                                <MaterialCommunityIcons name="content-copy" size={16} color="#262626" />
                                <Text className="text-sm font-semibold">複製する</Text>
                            </Pressable>
                            <Pressable
                                onPress={handleRemove}
                                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-gray-300 py-2"
                            >
                                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#dc2626" />
                                <Text className="text-sm font-semibold">削除する</Text>
                            </Pressable>
                        </View>
                    </View>
                )}
            </View>

            {/* 切りぬきを調整シート */}
            {showCropSheet && selectedCut && (
                <CutAdjustSheet
                    initialCutId={selectedCut.cutId}
                    clipMap={clipMap}
                    thumbs={thumbs}
                    muted={muted}
                    onClose={handleCloseCropSheet}
                />
            )}
        </SafeAreaView>
    );
}

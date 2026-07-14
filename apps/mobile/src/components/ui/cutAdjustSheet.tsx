import { Text } from '@/components/ui/text';
import type { ClipMap } from '@/lib/clipMap';
import { useEditStore, type Cut, type Transform } from '@/stores/editStore';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

/* 定数 */
const FRAME_W = 150;        // 中央固定の水色フレームの幅(px)。「カットの長さ(ms) = この幅」という縮尺になる
const FILM_H = 56;          // フィルムストリップの高さ
const FILM_THUMB_W = 48;    // フィルムストリップ内のサムネ1枚の幅
const MAX_FILM_THUMBS = 30; // サムネ生成枚数の上限（生成が重いため）
const ZOOM_MIN = 1;         // 1.0 = 元フレームに収まる最大範囲（設計mdの定義どおり）
const ZOOM_MAX = 3;
const PLAYER_H = 230;       // 中部プレーヤーの高さ
const DIM_COLOR = 'rgba(0, 0, 0, 0.45)'; // 切り抜き枠の外側に重ねる半透明の黒

// editor.tsx と同じサムネキー（editorで生成済みのサムネを使い回すため）
const thumbKey = (cut: { clipId: string; startMs: number }) => `${cut.clipId}:${cut.startMs}`;

// ミリ秒 → 00:00:00
const formatClock = (ms: number): string => {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

// ミリ秒 → 00:03（カットの長さバッジ）
const formatBadge = (ms: number): string => {
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(m)}:${pad(s)}`;
};

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

type Props = {
    initialCutId: string;                 // 開いた時に編集対象にするカット
    clipMap: ClipMap;                     // サーバー clips（署名付きURL・解像度・シーン）
    thumbs: Record<string, string>;       // editorで生成済みのサムネ（上部タイムラインに使う）
    muted?: boolean;                      // editor側のミュート設定を引き継ぐ
    onClose: (lastCutId: string) => void; // 閉じる時に「最後に編集していたカットID」を返す
};

export default function CutAdjustSheet({ initialCutId, clipMap, thumbs, muted, onClose }: Props) {
    const timeline = useEditStore((s) => s.timeline);

    // いま編集対象になっているカット
    const [currentCutId, setCurrentCutId] = useState(initialCutId);
    const currentCut = timeline.find((c) => c.cutId === currentCutId) ?? null;

    return (
        <Modal visible transparent animationType="slide" onRequestClose={() => onClose(currentCutId)}>
            {/* Modalは別のネイティブ画面扱いなので、中でジェスチャーを使うにはRootViewをもう1つ置く */}
            <GestureHandlerRootView style={{ flex: 1 }}>
                <View className="flex-1 justify-end">
                    {/* シートの上の暗い部分。タップでも閉じられる */}
                    <Pressable className="flex-1 bg-black/30" onPress={() => onClose(currentCutId)} />

                    <View className="rounded-t-3xl bg-white pb-10 pt-1">
                        {/* 閉じる（下向き矢印） */}
                        <Pressable
                            onPress={() => onClose(currentCutId)}
                            className="items-center py-1"
                            hitSlop={8}
                        >
                            <MaterialCommunityIcons name="chevron-down" size={30} color="#262626" />
                        </Pressable>
                        <Text className="text-center text-base font-bold">切り抜き箇所を調整</Text>

                        {/* ===== 上部: カットのタイムライン ===== */}
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator
                            style={{ flexGrow: 0 }}
                            contentContainerStyle={{
                                paddingHorizontal: 16,
                                paddingVertical: 10,
                                alignItems: 'center',
                            }}
                        >
                            {timeline.map((cut, i) => {
                                const selected = cut.cutId === currentCutId;
                                const uri = thumbs[thumbKey(cut)];
                                return (
                                    <View key={cut.cutId} className="flex-row items-center">
                                        {i > 0 && <View className="h-[2px] w-4 bg-gray-300" />}
                                        <Pressable
                                            // 別カットを選ぶ → 下のCutEditorが作り直され、
                                            // その「アンマウント」のタイミングで今の編集が保存される
                                            onPress={() => setCurrentCutId(cut.cutId)}
                                            className={`overflow-hidden rounded-lg border-2 ${
                                                selected ? 'border-primary' : 'border-transparent'
                                            }`}
                                        >
                                            {uri ? (
                                                <Image
                                                    source={{ uri }}
                                                    style={{ width: 64, height: 64 }}
                                                    resizeMode="cover"
                                                />
                                            ) : (
                                                <View style={{ width: 64, height: 64 }} className="bg-slate-200" />
                                            )}
                                            <View className="absolute bottom-1 right-1 rounded bg-black/70 px-1">
                                                <Text className="text-[10px] text-white">
                                                    {formatBadge(cut.endMs - cut.startMs)}
                                                </Text>
                                            </View>
                                        </Pressable>
                                    </View>
                                );
                            })}
                        </ScrollView>

                        {/* ===== 中部+下部: 選択中カットの編集 =====
                            key={cutId} がポイント。カットが切り替わるたびにコンポーネントごと
                            作り直される（＝前のカットの状態が確実にリセットされ、保存も走る） */}
                        {currentCut ? (
                            <CutEditor key={currentCut.cutId} cut={currentCut} clipMap={clipMap} muted={muted} />
                        ) : (
                            <Text className="py-10 text-center text-gray-400">カットがありません</Text>
                        )}
                    </View>
                </View>
            </GestureHandlerRootView>
        </Modal>
    );
}

// カット編集
function CutEditor({ cut, clipMap, muted }: { cut: Cut; clipMap: ClipMap; muted?: boolean }) {
    const updateCut = useEditStore((s) => s.updateCut);

    const clip = clipMap[cut.clipId];
    // このカットが属するシーン（フィルムストリップで動かせる範囲になる）
    const scene = clip?.scenes.find((sc) => sc.sceneId === cut.sceneId);
    const sceneStart = scene?.startMs ?? 0;
    const sceneEnd = scene?.endMs ?? clip?.durationMs ?? cut.endMs;
    const cutLen = Math.max(cut.endMs - cut.startMs, 1); // カットの長さは固定（位置だけ動かす）

    // 編集中のドラフト値
    const [startMs, setStartMs] = useState(cut.startMs);
    const [transform, setTransform] = useState<Transform>({ ...cut.transform });

    // イベントリスナーやアンマウント時に「最新の値」を読むためのref。
    // （リスナーは登録した瞬間のstateを覚えてしまうので、refを経由して読む）
    const startMsRef = useRef(cut.startMs);
    const transformRef = useRef<Transform>({ ...cut.transform });

    const applyStartMs = (v: number) => {
        startMsRef.current = v;
        setStartMs(v);
    };

    // 切り抜き枠が動画からはみ出さないようにzoom/offsetを丸める
    const clampTransform = (t: Transform): Transform => {
        const zoom = clamp(t.zoom, ZOOM_MIN, ZOOM_MAX);
        if (!clip) return { zoom, offsetX: 0, offsetY: 0 };
        const side = Math.min(clip.width, clip.height) / zoom; // 切り抜き正方形の一辺(動画px)
        const maxX = (clip.width - side) / (2 * clip.width);
        const maxY = (clip.height - side) / (2 * clip.height);
        return {
            zoom,
            offsetX: clamp(t.offsetX, -maxX, maxX),
            offsetY: clamp(t.offsetY, -maxY, maxY),
        };
    };

    const applyTransform = (t: Transform) => {
        const c = clampTransform(t);
        transformRef.current = c;
        setTransform(c);
    };

    // カット位置、表示位置の保存
    useEffect(() => {
        return () => {
            const s = clamp(startMsRef.current, sceneStart, Math.max(sceneEnd - cutLen, sceneStart));
            updateCut(cut.cutId, {
                startMs: s,
                endMs: s + cutLen,
                transform: transformRef.current,
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ビデオプレーヤー
    const player = useVideoPlayer(clip?.videoUrl ?? null, (p) => {
        p.timeUpdateEventInterval = 0.1; // ループの折り返しを細かく判定したいので短めに
        p.loop = false; // 「動画ファイル全体のループ」ではなく「カット範囲のループ」を自前で行う
        p.muted = !!muted;
    });

    // フレーム内の再生位置（0〜1）。下のフィルムストリップの再生ラインに使う
    const [playheadRatio, setPlayheadRatio] = useState(0);

    useEffect(() => {
        const subs = [
            // 読み込み完了 → カットの先頭へシークして自動再生
            player.addListener('statusChange', ({ status }) => {
                if (status === 'readyToPlay') {
                    player.currentTime = startMsRef.current / 1000;
                    player.play();
                }
            }),
            // カットの終端に達したら先頭へ戻す(=ループ)。次のカットへは進まない
            player.addListener('timeUpdate', ({ currentTime }) => {
                const startSec = startMsRef.current / 1000;
                const endSec = (startMsRef.current + cutLen) / 1000;
                if (currentTime >= endSec || currentTime < startSec - 0.3) {
                    // 範囲外（終端に達した / スクロールで範囲が動いた）→ 先頭へ
                    player.currentTime = startSec;
                    return;
                }
                setPlayheadRatio(clamp((currentTime - startSec) / (endSec - startSec), 0, 1));
            }),
            // 動画ファイル自体の終端に達した場合の保険（カットの終わり＝動画の終わりのケース）
            player.addListener('playToEnd', () => {
                player.currentTime = startMsRef.current / 1000;
                player.play();
            }),
        ];
        return () => subs.forEach((s) => s.remove());
        // リスナー内ではref経由で最新値を読むので、登録は初回の1回だけでよい
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // まれに登録前にreadyToPlayになっていた場合の保険
    useEffect(() => {
        if (player.status === 'readyToPlay') {
            player.currentTime = startMsRef.current / 1000;
            player.play();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* プレーヤーの表示計算  */
    const [box, setBox] = useState({ w: 0, h: 0 }); // 黒いコンテナの実サイズ

    // 画面上の切り抜き枠の位置・サイズ
    const frame = useMemo(() => {
        if (!box.w || !box.h) return null;
        const padding = 24;
        const side = Math.max(Math.min(box.w, box.h) - padding * 2, 0);
        return { side, left: (box.w - side) / 2, top: (box.h - side) / 2 };
    }, [box]);
    
    const video = useMemo(() => {
        if (!clip || !frame) return null;
        // 動画上の切り抜き正方形の一辺(動画px)
        const cropSide = Math.min(clip.width, clip.height) / transform.zoom;
        // 動画px → 画面px の倍率。「動画上のcropSide = 画面上のframe.side」になる倍率
        const scale = frame.side / cropSide;
        const w = clip.width * scale;
        const h = clip.height * scale;
        // 動画を「枠の中心が動画上の (0.5+offset) の位置」に来るよう配置する
        // → 動画の中心は枠の中心から -offset ずれた場所
        return {
            w,
            h,
            left: frame.left + frame.side / 2 - w / 2 - transform.offsetX * clip.width * scale,
            top: frame.top + frame.side / 2 - h / 2 - transform.offsetY * clip.height * scale,
            scale,
        };
    }, [clip, frame, transform]);

    /* ---------- ジェスチャー（ドラッグ=位置 / ピンチ=サイズ） ---------- */
    // ジェスチャー開始時点の値。「開始時からどれだけ動いたか」で計算するとズレない
    const gestureBase = useRef<Transform>({ ...cut.transform });

    const panGesture = Gesture.Pan()
        .maxPointers(1)
        .runOnJS(true) // コールバックを普通のJS関数として実行する
        .onStart(() => {
            gestureBase.current = { ...transformRef.current };
        })
        .onUpdate((e) => {
            if (!clip || !frame) return;
            // ジェスチャー開始時のスケール(動画px→画面px)を、開始時のzoomから計算する
            const scaleBase =
                (frame.side * gestureBase.current.zoom) / Math.min(clip.width, clip.height);
            // 動画を指と同じ向きに動かす = 「枠の中心が動画上のどこか」は逆向きにずれる
            // → offset は translation と逆符号にする
            applyTransform({
                zoom: transformRef.current.zoom,
                offsetX: gestureBase.current.offsetX - e.translationX / (scaleBase * clip.width),
                offsetY: gestureBase.current.offsetY - e.translationY / (scaleBase * clip.height),
            });
        });

    const pinchGesture = Gesture.Pinch()
        .runOnJS(true)
        .onStart(() => {
            gestureBase.current = { ...transformRef.current };
        })
        .onUpdate((e) => {
            // ピンチアウト(scale>1) → 枠が大きくなる = 写る範囲が広がる = zoomは小さくなる
            applyTransform({ ...transformRef.current, zoom: gestureBase.current.zoom / e.scale });
        });

    // ドラッグとピンチを同時に受け付ける
    const gesture = Gesture.Simultaneous(panGesture, pinchGesture);

    /* ---------- 下部: フィルムストリップの計算 ----------
       縮尺の決め方: 「カットの長さ(ms)」が「フレーム幅(FRAME_W px)」になるようにする。
       するとシーン全体の帯の幅が自動的に決まり、
       スクロール量(px) ÷ pxPerMs = カット開始位置のズレ(ms) になる */
    const sceneLen = Math.max(sceneEnd - sceneStart, cutLen);
    const pxPerMs = FRAME_W / cutLen;
    const stripW = sceneLen * pxPerMs;                    // シーン全体の帯の幅
    const maxScrollX = Math.max(stripW - FRAME_W, 0);     // スクロールできる最大量

    const [stripBoxW, setStripBoxW] = useState(0);        // 帯エリアの実際の幅(px)
    const sidePad = Math.max((stripBoxW - FRAME_W) / 2, 0); // フレームを中央に置くための左右余白

    // スクロール量 → カットの開始位置（フレームは固定で、帯の方が動く）
    const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const x = clamp(e.nativeEvent.contentOffset.x, 0, maxScrollX);
        applyStartMs(Math.round(sceneStart + x / pxPerMs));
    };
    // スクロールが止まったら、新しい開始位置へシークして続きを再生
    const handleScrollEnd = () => {
        player.currentTime = startMsRef.current / 1000;
    };

    /* フィルムストリップ用サムネイル生成 */
    const thumbCount = Math.min(Math.ceil(stripW / FILM_THUMB_W), MAX_FILM_THUMBS);
    const [filmThumbs, setFilmThumbs] = useState<(string | null)[]>([]);

    useEffect(() => {
        let cancelled = false; // 画面を離れた後にsetStateしないためのフラグ
        (async () => {
            if (!clip) return;
            try {
                // サーバーの署名付きURLをそのまま渡してフィルムストリップを生成する
                const arr: (string | null)[] = new Array(thumbCount).fill(null);
                for (let i = 0; i < thumbCount; i++) {
                    // サムネi枚目の左端が指す時刻
                    const timeMs = Math.round(
                        sceneStart + Math.min((i * FILM_THUMB_W) / pxPerMs, sceneLen - 1)
                    );
                    const { uri } = await VideoThumbnails.getThumbnailAsync(clip.videoUrl, { time: timeMs });
                    if (cancelled) return;
                    arr[i] = uri;
                    setFilmThumbs([...arr]); // 生成できた分から順に表示する
                }
            } catch (e) {
                console.warn('フィルムストリップのサムネ生成に失敗:', e);
            }
        })();
        return () => {
            cancelled = true;
        };
        // このコンポーネントはカットごとに作り直されるので、初回1回だけでよい
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!clip) {
        return <Text className="py-10 text-center text-gray-400">動画が見つかりません</Text>;
    }

    // 開いた瞬間のスクロール位置（= 現在のカット開始位置がフレーム内に来る位置）
    const initialScrollX = clamp((cut.startMs - sceneStart) * pxPerMs, 0, maxScrollX);

    return (
        <View>
            {/* ビデオプレーヤー */}
            <GestureDetector gesture={gesture}>
                <View
                    className="mx-4 overflow-hidden rounded-lg bg-black"
                    style={{ height: PLAYER_H }}
                    onLayout={(e) =>
                        setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
                    }
                >
                    {video && (
                        <VideoView
                            player={player}
                            style={{
                                position: 'absolute',
                                left: video.left,
                                top: video.top,
                                width: video.w,
                                height: video.h,
                            }}
                            // サイズは縦横比を保ってこちらで計算済みなので、styleどおりに広げる
                            contentFit="fill"
                            nativeControls={false}
                        />
                    )}
                    {frame && (
                        <View pointerEvents="none" className="absolute inset-0">
                            {/* 上 */}
                            <View
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: 0,
                                    width: box.w,
                                    height: Math.max(frame.top, 0),
                                    backgroundColor: DIM_COLOR,
                                }}
                            />
                            {/* 下 */}
                            <View
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: frame.top + frame.side,
                                    width: box.w,
                                    height: Math.max(box.h - (frame.top + frame.side), 0),
                                    backgroundColor: DIM_COLOR,
                                }}
                            />
                            {/* 左 */}
                            <View
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: frame.top,
                                    width: Math.max(frame.left, 0),
                                    height: frame.side,
                                    backgroundColor: DIM_COLOR,
                                }}
                            />
                            {/* 右 */}
                            <View
                                style={{
                                    position: 'absolute',
                                    left: frame.left + frame.side,
                                    top: frame.top,
                                    width: Math.max(box.w - (frame.left + frame.side), 0),
                                    height: frame.side,
                                    backgroundColor: DIM_COLOR,
                                }}
                            />
                        </View>
                    )}
                    {/* 切り抜き枠（1:1で出力される範囲） */}
                    {frame && (
                        <View
                            pointerEvents="none"
                            style={{
                                position: 'absolute',
                                left: frame.left,
                                top: frame.top,
                                width: frame.side,
                                height: frame.side,
                            }}
                        >
                            <View className="absolute inset-0 rounded-sm border border-white/80" />
                            {/* 四隅のかぎマーク */}
                            {(
                                [
                                    { left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3 },
                                    { right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3 },
                                    { left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3 },
                                    { right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3 },
                                ] as const
                            ).map((s, i) => (
                                <View
                                    key={i}
                                    style={{
                                        position: 'absolute',
                                        width: 18,
                                        height: 18,
                                        borderColor: '#171717',
                                        ...s,
                                    }}
                                />
                            ))}
                        </View>
                    )}
                </View>
            </GestureDetector>
            <Text className="mt-1 text-center text-[10px] text-gray-400">
                ドラッグで位置、ピンチでサイズを調整できます
            </Text>

            {/*  カット位置の調整 */}
            <View className="mx-4 mt-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-md shadow-gray-100">
                {/* 現在のカット開始位置 */}
                <Text className="text-center text-[11px] text-gray-500">{formatClock(startMs + playheadRatio * cutLen)}</Text>
                <View
                    className="mt-1"
                    style={{ height: FILM_H + 16 }}
                    onLayout={(e) => setStripBoxW(e.nativeEvent.layout.width)}
                >
                    {/* 実幅が分かってから描画する（先に描くと余白計算がズレるため） */}
                    {stripBoxW > 0 && (
                        <>
                            <ScrollView
                                horizontal
                                bounces={false}
                                showsHorizontalScrollIndicator
                                scrollEventThrottle={16}
                                onScroll={handleScroll}
                                onScrollEndDrag={handleScrollEnd}
                                onMomentumScrollEnd={handleScrollEnd}
                                // iOSは contentOffset で初期スクロール位置を指定できる
                                contentOffset={{ x: initialScrollX, y: 0 }}
                                contentContainerStyle={{
                                    paddingHorizontal: sidePad,
                                    paddingVertical: 8,
                                }}
                            >
                                {/* シーン全体のサムネの帯 */}
                                <View
                                    className="flex-row overflow-hidden rounded-md bg-slate-200"
                                    style={{ width: stripW, height: FILM_H }}
                                >
                                    {Array.from({ length: thumbCount }).map((_, i) =>
                                        filmThumbs[i] ? (
                                            <Image
                                                key={i}
                                                source={{ uri: filmThumbs[i]! }}
                                                style={{ width: FILM_THUMB_W, height: FILM_H }}
                                                resizeMode="cover"
                                            />
                                        ) : (
                                            <View
                                                key={i}
                                                style={{ width: FILM_THUMB_W, height: FILM_H }}
                                                className="bg-slate-300"
                                            />
                                        )
                                    )}
                                </View>
                            </ScrollView>

                                       {/* 枠内の半透明水色 */}
                                       <View
                                           pointerEvents="none"
                                           style={{
                                               position: 'absolute',
                                               left: sidePad,
                                               top: 8,
                                               width: FRAME_W,
                                               height: FILM_H,
                                               backgroundColor: 'rgba(34, 211, 238, 0.2)',
                                           }}
                                       />
                                       {/* 上下の細い枠 */}
                                       <View
                                           pointerEvents="none"
                                           style={{
                                               position: 'absolute',
                                               left: sidePad,
                                               top: 8,
                                               width: FRAME_W,
                                               height: FILM_H,
                                               borderTopWidth: 4,
                                               borderBottomWidth: 4,
                                               borderColor: '#22d3ee',
                                           }}
                                       />
                                       {/* 左の太いバー */}
                                       <View
                                           pointerEvents="none"
                                           style={{
                                               position: 'absolute',
                                               left: sidePad - 8,
                                               top: 8,
                                               width: 10,
                                               height: FILM_H,
                                               backgroundColor: '#22d3ee',
                                               borderTopLeftRadius: 6,
                                               borderBottomLeftRadius: 6,
                                           }}
                                       />
                                       {/* 右の太いバー */}
                                       <View
                                           pointerEvents="none"
                                           style={{
                                               position: 'absolute',
                                               left: sidePad + FRAME_W - 2,
                                               top: 8,
                                               width: 10,
                                               height: FILM_H,
                                               backgroundColor: '#22d3ee',
                                               borderTopRightRadius: 6,
                                               borderBottomRightRadius: 6,
                                           }}
                                       />
                            {/* ループ再生の現在位置ライン */}
                            <View
                                pointerEvents="none"
                                style={{
                                    position: 'absolute',
                                    left: sidePad + playheadRatio * FRAME_W - 1,
                                    top: 0,
                                    width: 3,
                                    height: FILM_H + 16,
                                    backgroundColor: '#ebebeb',
                                }}
                            />
                        </>
                    )}
                </View>
            </View>
        </View>
    );
}

import { useStartRender } from '@/hooks/useStartRender';
import { GradientButton } from '@/components/ui/gradientButton';
import { Input } from "@/components/ui/input";
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import { Textarea } from "@/components/ui/textarea";
import { CustomModal } from '@/components/ui/customModal';
import { useProjectStatus } from '@/hooks/useProjectStatus';
import { buildClipMap, type ClipMap } from '@/lib/clipMap';
import { useEditStore, type Cut } from '@/stores/editStore';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 2つのプレーヤーの識別子
type PlayerKey = 'A' | 'B';

// ビデオプレーヤーによって映す位置
const videoLayoutFor = (cut: Cut | null, containerSize: number, clipMap: ClipMap) => {
    const clip = cut ? clipMap[cut.clipId] : undefined;
    if (!cut || !clip || !containerSize) {
        // 計算できないうちはコンテナいっぱいに表示
        return { width: '100%' as const, height: '100%' as const, left: 0, top: 0 };
    }
    const { width: W, height: H } = clip;
    const { zoom, offsetX, offsetY } = cut.transform;

    // 切り抜く正方形の一辺(動画ピクセル)
    const cropSide = Math.min(W, H) / zoom;
    // 動画ピクセル → 画面px の倍率。「切り抜き正方形 = コンテナの一辺」になるように
    const scale = containerSize / cropSide;

    // 切り抜き正方形の左上(動画ピクセル)
    const cropLeft = (0.5 + offsetX) * W - cropSide / 2;
    const cropTop = (0.5 + offsetY) * H - cropSide / 2;

    return {
        width: W * scale,   // 動画全体の描画サイズ
        height: H * scale,
        left: -cropLeft * scale, // 切り抜き位置がコンテナの左上に来るよう、動画をマイナス方向へずらす
        top: -cropTop * scale,
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

export default function ConfigScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    
    const { data: project } = useProjectStatus(id);
    const clipMap = useMemo<ClipMap>(() => buildClipMap(project?.clips), [project?.clips]);

    /* Zustand */
    const timeline = useEditStore((s) => s.timeline);
    const reset = useEditStore((s) => s.reset);
    const startRender = useStartRender();

    // 最初のカット
    const firstCut = timeline[0];

    // プレーヤー
    const initialSource = useRef(firstCut ? (clipMap[firstCut.clipId]?.videoUrl ?? null) : null);
    const playerA = useVideoPlayer(initialSource.current, (p) => {
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
    // いまプレビュー再生の対象になっているカット
    const [playingCutId, setPlayingCutId] = useState<string | null>(firstCut?.cutId ?? null);
    // モーダルが表示されているかどうか
    const [isConfirmModal, setIsConfirmModal] = useState(false);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [password, setPassword] = useState('');

    // イベントリスナーから最新値を読む用のref
    const timelineRef = useRef(timeline);
    const activeKeyRef = useRef<PlayerKey>('A');
    const playingCutIdRef = useRef<string | null>(firstCut?.cutId ?? null);
    // いま各プレーヤーに読み込まれている元動画
    const loadedClip = useRef<Record<PlayerKey, string | null>>({
        A: firstCut?.clipId ?? null,
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
                player.replaceAsync(clip.videoUrl).catch((e) => {
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
    
    async function handleRender() {
        try {
            await startRender.mutateAsync({
                projectId: id,
                title: title.trim() ? title.trim() : null,
                description: description.trim() ? description.trim() : null,
            });
            // 送信済みの編集内容はクリア（次プロジェクトに残さない）
            reset();
            router.replace({
                pathname: '/project/[id]/done',
                params: { id },
            });
        } catch {
            // エラー表示は startRender.isError で下部に出す
        }
    }

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

    // 画面に入った瞬間、先頭カットを表示
    useEffect(() => {
        const first = useEditStore.getState().timeline[0];
        if (first) showCutOnActive(first, { autoplay: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    // タイムライン全体の長さ
    const totalMs = timeline.reduce((sum, c) => sum + (c.endMs - c.startMs), 0);
    // シークバー
    const progressValue = totalMs > 0 ? Math.min((elapsedMs / totalMs) * 100, 100) : 0;

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

    // idはあるが、カット情報がない場合、シーン選択画面へ誘導
    // if (timeline.length === 0) {
    //     return (
    //         <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-white">
    //             <Text className="text-gray-500">カットが選択されていません</Text>
    //             <Pressable
    //                 onPress={() =>
    //                     router.replace({ pathname: '/project/[id]/scenes', params: { id } })
    //                 }
    //                 className="rounded-lg bg-primary px-6 py-2"
    //             >
    //                 <Text className="font-bold text-white">シーン選択に戻る</Text>
    //             </Pressable>
    //         </SafeAreaView>
    //     );
    // }

    return (
        <SafeAreaView className="w-full flex-1 bg-white">
            {/* ヘッダー */}
            <View className="h-16 flex-row items-center justify-center">
                <Pressable onPress={() => router.back()} className="absolute left-2 p-2">
                    <MaterialCommunityIcons name="chevron-left" size={40} color="#262626" />
                </Pressable>
                <Text className="text-base font-bold">動画情報を設定</Text>
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
                                    }}
                                    contentFit="fill"
                                    nativeControls={false}
                                />
                            </View>
                        );
                    })}
                </View>
            </View>
            <View className="h-8 my-2 flex-row items-center justify-center gap-2">
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
            </View>

            <View className="mx-6 my-3 gap-2 rounded-xl">
                <View className="flex-row justify-between items-end">
                    <Text className="text-lg font-semibold text-[#262626]">タイトル (任意)</Text>
                    <Text className="text-md text-gray-400">{title.length} / 20</Text>
                </View>
                <View>
                    <Input
                        placeholder="タイトルを入力してください"
                        value={title}
                        onChangeText={(value) => {
                            if (value.length <= 20) setTitle(value);
                        }}
                        className="mb-2"
                    />
                </View>
            </View>
            <View className="mx-6 mb-3 gap-2 rounded-xl">
                <View className="flex-row justify-between items-end">
                    <Text className="text-lg font-semibold text-[#262626]">説明文(任意)</Text>
                    <Text className="text-md text-gray-400">{description.length} / 100</Text>
                </View>
                <Textarea
                    placeholder="詳細を入力してください"
                    value={description}
                    onChangeText={(value) => {
                        if (value.length <= 100) setDescription(value);
                    }}
                    multiline={true}
                    numberOfLines={3}
                    className="mb-2"
                    style={{ height: 80 }} // 3行分の高さをスタイルで担保
                />
            </View>
            <View className="w-full my-4 flex flex-col justify-center items-center">
                <GradientButton
                    label={startRender.isPending ? '出力中…' : '完成動画を出力する'}
                    style={{ width: "80%" }}
                    textStyle={{ fontSize: 24 }}
                    onPress={() => setIsConfirmModal(true)}
                    disabled={startRender.isPending}
                />
                {startRender.isError && (
                <Text className="text-xs text-red-500" numberOfLines={2}>
                    失敗: {String(startRender.error)}
                </Text>
                )}
            </View>
                <CustomModal                                isOpen={isConfirmModal}
                    isOpenChange={setIsConfirmModal}
                    title="動画を作成してもよろしいですか"
                    description="OKを押すと編集に戻れません"
                    onConfirm={handleRender}/>
        </SafeAreaView>
    );
}

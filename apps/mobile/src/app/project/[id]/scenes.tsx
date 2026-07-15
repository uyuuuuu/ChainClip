import { Checkbox } from '@/components/ui/checkbox';
import { GradientButton } from '@/components/ui/gradientButton';
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import { useProjectStatus } from '@/hooks/useProjectStatus';
import { useLocalClips } from '@/lib/localClips';
import { useEditStore } from '@/stores/editStore';
import { router, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, GestureResponderEvent, Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

// サーバーの clips（署名付きURL付き）から、リスト表示用のシーン配列に平坦化した1要素の型。
type SceneItem = {
    sceneId: string;
    sceneIndex: number;
    startMs: number;
    endMs: number;
    labels: string[];
    clipId: string;
    videoUrl: string; // 変換後mp4の署名付きURL
};

export default function ScenesScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const insets = useSafeAreaInsets();

    // GET /projects/{id} を polling。preparing→ready で clips(scenes+署名付きURL) が揃う。
    const { data: project, isError, refetch } = useProjectStatus(id);
    const clips = project?.clips ?? [];

    // 変換後mp4を端末のキャッシュへダウンロードする。完了した分だけ clipId → file:// が入る。
    const { localUris, done: dlDone  } = useLocalClips(project?.clips);

    // ビデオプレーヤーの幅
    const { width: windowWidth } = useWindowDimensions();
    const playerWidth = windowWidth - 48; // 左右 mx-6 = 24px × 2
    const playerHeight = Math.floor(playerWidth * 9 / 16);

    // clips を「シーン1件ずつ」に平坦化する。ready 前は空配列。
    const ALL_SCENES = useMemo<SceneItem[]>(
        () =>
            clips.flatMap((clip) =>
                clip.scenes.map((scene) => ({
                    sceneId: scene.sceneId,
                    sceneIndex: scene.sceneIndex,
                    startMs: scene.startMs,
                    endMs: scene.endMs,
                    labels: [...new Set(scene.labels)],
                    clipId: clip.clipId,
                    videoUrl: clip.video.url,
                }))
            ),
        [clips]
    );

    const TAGS = useMemo(
        () => ['All', ...new Set(ALL_SCENES.flatMap((s) => s.labels))],
        [ALL_SCENES]
    );

    // 初期ソースは持たない（ready で clips が来てから replaceAsync で読み込む）。
    const player = useVideoPlayer(null, (p) => {
        p.timeUpdateEventInterval = 0.25; // 再生位置イベントを0.25秒ごとに発火
        p.loop = false;
    });

    // 読み込みできているかどうか(同期エラー防ぎ)
    const [isReady, setIsReady] = useState(false);
    // 再生されているかどうか
    const [isPlaying, setIsPlaying] = useState(false);
    // 再生進捗
    const [progress, setProgress] = useState(0);
    // バーの実際の幅(px)
    const [barWidth, setBarWidth] = useState(0);
    // 再生時間
    const [duration, setDuration] = useState(0);
    // 動画差し替え後、読み込み完了を待ってからシークするための「予約」
    const pendingSeekMs = useRef<number | null>(null);
    // いまプレーヤーに読み込まれている動画のURI（未ロードは null）
    const loadedVideoUri = useRef<string | null>(null);
    // プレビュー中のシーン範囲
    type PreviewRange = { sceneId: string; startMs: number; endMs: number };
    const [preview, setPreview] = useState<PreviewRange | null>(null);

    // イベントリスナーから読むためのref(理由は後述)
    const previewRef = useRef<PreviewRange | null>(preview);

    // stateとrefを常にセットで更新するヘルパー
    const setPreviewRange = (p: PreviewRange | null) => {
        previewRef.current = p;
        setPreview(p);
    };

    // 時間表示
    const formatTime = (seconds: number): string => {
        const total = Math.floor(seconds);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(h)}:${pad(m)}:${pad(s)}`;
    };

    // シーンの長さ表示（ミリ秒 → m:ss）
    const formatMs = (ms: number): string => {
        const total = Math.floor(ms / 1000);
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    };

    // プレーヤーの状態をUIに反映
    useEffect(() => {
        console.log('現在のstatus:', player.status);

        setIsReady(player.status === 'readyToPlay');
        setIsPlaying(player.playing);
        if (Number.isFinite(player.duration) && player.duration > 0) {
            setDuration(player.duration);
        }

        const playingSub = player.addListener('playingChange', ({ isPlaying }) => {
            setIsPlaying(isPlaying);
        });
        const timeSub = player.addListener('timeUpdate', ({ currentTime }) => {
            const range = previewRef.current;
            if (range) {
                // シーン基準: 0〜シーンの長さ に変換して進捗を出す
                const startSec = range.startMs / 1000;
                const endSec = range.endMs / 1000;
                const lengthSec = endSec - startSec;

                const rel = Math.min(Math.max(currentTime - startSec, 0), lengthSec); // 0〜lengthSecに丸める
                setProgress(lengthSec > 0 ? rel / lengthSec : 0);

                // シーンの終わりに達したら停止(バーは満タンのまま止まる)
                if (currentTime >= endSec) {
                    player.pause();
                }
            } else if (player.duration > 0) {
                // シーン未選択時: これまで通りclip全体基準
                setProgress(currentTime / player.duration);
            }

            if (player.duration > 0) {
                setDuration(player.duration);
                setIsReady(true);
            }
        });
        const statusSub = player.addListener('statusChange', ({ status }) => {
            setIsReady(status === 'readyToPlay');
            // 動画差し替え後、読み込みが終わったら予約していた位置にシークして再生
            if (status === 'readyToPlay' && pendingSeekMs.current != null) {
                player.currentTime = pendingSeekMs.current / 1000;
                pendingSeekMs.current = null;
                player.play();
            }
        });

        return () => {
            playingSub.remove();
            timeSub.remove();
            statusSub.remove();
        };
    }, [player]);

    // 表示に使う「動画の長さ」: プレビュー中はシーンの長さ、未選択ならclip全体
    const displayDuration = preview
        ? (preview.endMs - preview.startMs) / 1000
        : duration;

    // 再生/停止の切り替え
    const togglePlay = () => {
        if (isPlaying) {
            player.pause();
            return;
        }
        const range = previewRef.current;
        // シーンの終端(誤差0.05秒を許容)にいるなら先頭に戻してから再生
        if (range && player.currentTime >= range.endMs / 1000 - 0.05) {
            player.currentTime = range.startMs / 1000;
            setProgress(0);
        }
        player.play();
    };

    // バーがタップされたら再生位置を変える
    const handleSeek = (e: GestureResponderEvent) => {
        const d = player.duration;
        // barWidthが未確定、またはdurationが未取得なら何もしない
        if (!barWidth || !Number.isFinite(d) || d <= 0) return;

        const ratio = Math.min(Math.max(e.nativeEvent.locationX / barWidth, 0), 1);
        const range = previewRef.current;

        if (range) {
            // バーの0〜100%を startMs〜endMs に対応させる
            const startSec = range.startMs / 1000;
            const endSec = range.endMs / 1000;
            player.currentTime = startSec + ratio * (endSec - startSec);
        } else {
            player.currentTime = ratio * d;
        }
        setProgress(ratio); // UIに反映
    };

    // シーンをタップしたら、そのシーンをプレビュー再生する
    const previewScene = async (scene: SceneItem) => {
        setPreviewRange({ sceneId: scene.sceneId, startMs: scene.startMs, endMs: scene.endMs });
        setProgress(0); // バーを即座に0に見せる(シーク完了を待たない)

        // ローカルにダウンロード済みならfile://を使い、まだなら署名付きURLで代用する
        const uri = localUris[scene.clipId] ?? scene.videoUrl;
        if (loadedVideoUri.current !== uri) {
            // 別の動画 → 動画を差し替える。
            // 差し替え直後はまだシークできないので、位置を「予約」して
            // statusChangeがreadyToPlayになった時にシーク＆再生する
            loadedVideoUri.current = uri;
            pendingSeekMs.current = scene.startMs;
            setIsReady(false);
            player.pause();
            try {
                await player.replaceAsync(uri);  // 読み込み完了まで待つ
            } catch (e) {
                // 連打で中断された場合など。最後のタップ分が生きるので何もしなくてよい
                console.warn('動画の差し替えが中断されました:', e);
            }
        } else if (!isReady) {
            // 同じ動画だがまだ読み込み中 → こちらも予約しておく
            pendingSeekMs.current = scene.startMs;
        } else {
            // 同じ動画で読み込み済み → すぐシークして再生
            player.currentTime = scene.startMs / 1000;
            player.play();
        }
    };
    
    /* Zustand */
    // 選択済みシーン
    const selectedScenes = useEditStore((s) => s.selectedScenes);
    // 選択されているかどうか
    const toggleScene = useEditStore((s) => s.toggleScene);
    // タイムライン生成
    const buildTimeline = useEditStore((s) => s.buildTimeline);
    const sceneThumbnails = useEditStore((s) => s.sceneThumbnails);
    const setSceneThumbnail = useEditStore(s => s.setSceneThumbnail);

    // サムネイル生成
    // 生成済み(生成中)のシーンID
    const generatedKeys = useRef(new Set<string>());

    useEffect(() => {
        let cancelled = false; // 画面を離れた後にsetStateしないためのフラグ

        const generate = async () => {
            // ローカルにダウンロード済みの動画からシーン先頭フレームをサムネ化する
            for (const scene of ALL_SCENES) {
                if (cancelled) return;
                if (sceneThumbnails[scene.sceneId]) continue;
                const localUri = localUris[scene.clipId];
                if (!localUri) continue;
                if (generatedKeys.current.has(scene.sceneId)) continue;
                generatedKeys.current.add(scene.sceneId);
                try {
                    const thumb = await VideoThumbnails.getThumbnailAsync(localUri, {
                        time: scene.startMs, // ミリ秒指定。シーンの先頭フレームをサムネにする
                    });
                    if (!cancelled) {
                        // 1枚できるたびに反映（全部待たずに順次表示される）
                        setSceneThumbnail(scene.sceneId, thumb.uri);
                    }
                } catch (e) {
                    generatedKeys.current.delete(scene.sceneId); // 失敗したら次回リトライできるように戻す
                    console.warn('サムネイル生成に失敗:', e);
                }
            }
        };

        generate();
        return () => {
            cancelled = true;
        };
    }, [ALL_SCENES, localUris, sceneThumbnails, setSceneThumbnail]);

    // 選択済みシーンのSet
    const selectedIdSet = new Set(selectedScenes.map((s) => s.sceneId));
    const isDisabled = selectedScenes.length === 0;

    // storeのtoggleSceneに渡す形に変換する
    const toggleOne = (scene: SceneItem) =>
        toggleScene({
            sceneId: scene.sceneId,
            clipId: scene.clipId,
            startMs: scene.startMs,
            endMs: scene.endMs,
        });

    // 絞り込み検索で選択されているタグ(複数選択は現状できない)
    const [activeTag, setActiveTag] = useState('All');

    // タグの絞り込み
    const filteredScenes =
        activeTag === 'All' ? ALL_SCENES : ALL_SCENES.filter((s) => s.labels.includes(activeTag));

    // 表示中の全シーンが選択済みかどうか
    const allSelected =
        filteredScenes.length > 0 && filteredScenes.every((s) => selectedIdSet.has(s.sceneId));

    const toggleAll = () => {
        filteredScenes.forEach((scene) => {
            const isSelected = selectedIdSet.has(scene.sceneId);
            // 全選択済みなら全部OFFに、そうでなければ未選択のものだけONにする
            if (allSelected ? isSelected : !isSelected) toggleOne(scene);
        });
    };

    // clips が揃ったら先頭シーンを自動プレビュー（未選択状態から一度だけ）
    useEffect(() => {
        if (ALL_SCENES.length > 0 && loadedVideoUri.current === null) {
            previewScene(ALL_SCENES[0]);
        }
        // previewScene は都度生成される関数なので依存に入れない（ALL_SCENES 変化時のみ判定）
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ALL_SCENES]);

    // preparing中・取得前はローディング、failedはエラー表示
    const projectStatus = project?.status;
    if (projectStatus !== 'ready' || !dlDone) {
        const isFailed = projectStatus === 'failed';
        return (
            <SafeAreaView className="w-full flex-1 bg-white">
                <View className="h-16 flex-row items-center justify-center">
                    <Pressable
                        onPress={() => router.back()}
                        className="absolute left-2 p-2">
                        <MaterialCommunityIcons name="chevron-left" size={48} color="#262626" />
                    </Pressable>
                </View>
                {isFailed ? (
                    <View className="flex-1 items-center justify-center px-8 gap-4">
                        <Text className="text-center text-red-500 font-bold">解析に失敗しました</Text>
                        {project?.errorMessage && (
                            <Text className="text-center text-xs text-gray-500" numberOfLines={3}>
                                {project.errorMessage}
                            </Text>
                        )}
                    </View>
                ) : isError ? (
                    <View className="flex-1 items-center justify-center px-8 gap-4">
                        <Text className="text-center text-red-500 font-bold">通信に失敗しました</Text>
                        <Text className="text-center text-xs text-gray-500">
                            電波の良い場所で再度お試しください
                        </Text>
                        <Pressable
                            onPress={() => refetch()}
                            className="rounded-lg bg-primary px-6 py-2">
                            <Text className="font-bold text-white">再試行</Text>
                        </Pressable>
                    </View>
                ) : (
                    <View className="flex-1 items-center justify-center px-8 gap-4">
                        <ActivityIndicator size="large" color="#029FFF" />
                        <Text className="text-center text-xl font-bold text-[#029FFF]">動画を解析中…</Text>
                        {project?.clipsTotal != null ? (
                            <Text className="text-xs text-gray-500">
                                {project.clipsReady ?? 0} / {project.clipsTotal} 本 完了
                            </Text>
                        ) : (
                            <Text className="text-xs text-gray-500">
                                動画を読み込んでいます
                            </Text>
                        )}
                    </View>
                )}
            </SafeAreaView>
        );
    }

    return (
            <SafeAreaView className="w-full flex-1 bg-white">

            {/* ヘッダー */}
            <View className="h-16 flex-row items-center justify-center">
                <Pressable
                    onPress={() => router.back()}
                    className="absolute left-2 p-2">
                    <MaterialCommunityIcons name="chevron-left" size={48} color="#262626" />
                </Pressable>
                <Text className="text-base font-bold">思い出の場面を選ぶ</Text>
            </View>

            {/* ビデオプレーヤー */}
            <View className="bg-black mb-2 overflow-hidden rounded-xl self-center">
                <VideoView
                    player={player}
                    style={{ width: playerWidth, height: playerHeight }}
                    contentFit="contain"
                    nativeControls={false}
                />
            </View>
            <View className="h-8 mb-2 flex-row items-center justify-center gap-2">
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
                        {formatTime(progress * displayDuration)} / {formatTime(displayDuration)}
                    </Text>
                    {/* シークバー */}
                    <Pressable
                        className="py-2"
                        onPress={isReady ? handleSeek : undefined}
                        style={{ opacity: isReady ? 1 : 0.4 }}
                    >
                        <Progress className="w-full h-1.5" value={progress * 100} />
                    </Pressable>
                </View>
            </View>

            {/* タグ絞り込み(横スクロールできる) */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className=" mx-2 grow-0 mb-3"
                contentContainerClassName="items-center gap-2 px-4 py-2"
            >
                {TAGS.map((tag) => (
                    <Pressable
                        key={tag}
                        onPress={() => setActiveTag(tag)}
                        className={`rounded-md px-4 py-1.5  ${activeTag === tag ? 'bg-primary' : 'bg-slate-200'}`}
                    >
                        <Text className={`text-sm font-bold ${activeTag === tag ? 'text-white' : 'text-[#262626]'}`}>
                            {tag}
                        </Text>
                    </Pressable>
                ))}
            </ScrollView>

            {/* シーン数表示 + 全選択チェックボックス */}
            <View className="mb-2 flex-row items-center justify-between px-6">
                <Text className="text-xs text-gray-400">シーン候補：{filteredScenes.length}件</Text>
                <View className="flex-row items-center gap-2">
                    <Text className="text-xs text-gray-400">全選択</Text>
                    <Pressable onPress={toggleAll}>
                        <Checkbox
                            checked={allSelected}
                            onCheckedChange={toggleAll}
                        />
                    </Pressable>
                </View>
            </View>

            {/* シーン一覧 */}
            <FlatList
                data={filteredScenes}
                keyExtractor={(s) => s.sceneId}
                className="flex-1"
                contentContainerClassName="px-4 pb-8 gap-3"
                renderItem={({ item }) => {
                    const selected = selectedIdSet.has(item.sceneId);
                    const isPreviewing = preview?.sceneId === item.sceneId;
                    return (
                        <Pressable
                            onPress={() => previewScene(item)}
                            className={`p-2 mx-2 flex-row items-center gap-2 rounded-lg border-2 shadow-md shadow-gray-100 ${isPreviewing ? 'border-primary' : 'border-gray-200'}
                            `}
                        >
                            <View className="relative">
                                {/* サムネイル（生成中はグレーのプレースホルダー） */}
                                {sceneThumbnails[item.sceneId] ? (
                                    <Image
                                        source={{ uri: sceneThumbnails[item.sceneId] }}
                                        style={{ width: 96, height: 52 }}
                                        className="h-16 w-24 rounded-sm"
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <View
                                        style={{ width: 96, height: 52 }}
                                        className="rounded-sm bg-slate-200"
                                    />
                                )}
                                {/* シーンの長さ */}
                                <View className="absolute bottom-1 right-1 rounded bg-black/70 px-1">
                                    <Text className="text-[10px] text-white">
                                        {formatMs(item.endMs - item.startMs)}
                                    </Text>
                                </View>
                            </View>
                            {/* ラベル */}
                            <View className="flex-1 flex-row flex-wrap justify-start content-center gap-2">
                                {item.labels.slice(0, 3).map((tag) => (
                                    <View
                                        key={tag}
                                        className="rounded-md px-2.5 py-0.5 bg-slate-200"
                                    >
                                        <Text
                                            className="text-xs font-semibold text-[#262626]"
                                            numberOfLines={1}
                                        >
                                            {tag}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                            <Pressable
                                onPress={() => toggleOne(item)}
                                hitSlop={1}
                                className="mx-2"
                            >
                                <Checkbox
                                    checked={selected}
                                    onCheckedChange={() => toggleOne(item)}
                                />
                            </Pressable>
                        </Pressable>
                    );
                }}
            />

            {/* 選択シーンを確認するフッター */}
            <View
                className="w-full h-28 px-4 gap-3 flex-row items-center justify-center bg-white">
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="flex-1"
                    contentContainerClassName="items-center gap-3 py-3 pr-2"
                >
                    {selectedScenes.map((scene) => (
                        <View key={scene.sceneId} className="relative">
                            {sceneThumbnails[scene.sceneId] ? (
                                <Image
                                    source={{ uri: sceneThumbnails[scene.sceneId] }}
                                    style={{ width: 58, height: 58 }}
                                    className="rounded-sm"
                                    resizeMode="cover"
                                />
                            ) : (
                                <View style={{ width: 58, height: 58 }} className="rounded-sm bg-slate-200" />
                            )}
                            {/* 削除ボタン */}
                            <Pressable
                                className="absolute -top-2 -right-2"
                                onPress={() => toggleScene(scene)}
                                hitSlop={8}
                            >
                                <View className="absolute top-[4px] left-[4px] w-[16px] h-[16px] bg-white rounded-full" />
                                <MaterialCommunityIcons name="close-circle" size={24} color="black" />
                            </Pressable>
                        </View>
                    )
                    )}
                </ScrollView>
                <View className="items-center justify-center gap-2">
                    <View className="flex-row items-baseline gap-1">
                        <Text className="mr-2 text-xs text-gray-500">選択中</Text>
                        <Text className="text-xl font-bold">{selectedScenes.length}</Text>
                        <Text className="text-xs text-gray-500">/ {ALL_SCENES.length}</Text>
                    </View>
                    <GradientButton
                        label="シーンを切り抜く"
                        textStyle={{ fontSize: 16, paddingHorizontal: 6, paddingVertical: 0 }}
                        style={{ opacity: isDisabled ? 0.4 : 1 }}
                        onPress={() => {
                            if (isDisabled) return;
                            buildTimeline();
                            router.push({
                                pathname: '/project/[id]/editor',
                                params: { id },
                            });
                        }}
                    />
                </View>
            </View>

        </SafeAreaView >
    );
}

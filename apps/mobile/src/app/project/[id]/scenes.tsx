import { Checkbox } from '@/components/ui/checkbox';
import { GradientButton } from '@/components/ui/gradientButton';
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import { router } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { FlatList, GestureResponderEvent, Image, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from "react-native-safe-area-context";

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

// 仮
import mov1 from "../../../../assets/videos/sample1.mp4";
const SCENES = [
    {
        sceneId: '1',
        thumb: require('@/assets/images/sample1.jpg'),
        labels: ['Building', 'Tree'],
        duration: '12:25',
    },
    {
        sceneId: '2',
        thumb: require('@/assets/images/sample2.jpg'),
        labels: ['Indoor', 'Tree'],
        duration: '7:14',
    },
    {
        sceneId: '3',
        thumb: require('@/assets/images/sample1.jpg'),
        labels: ['Building', 'Tree'],
        duration: '12:25',
    },
    {
        sceneId: '4',
        thumb: require('@/assets/images/sample2.jpg'),
        labels: ['Indoor', 'Tree'],
        duration: '7:14',
    },
    {
        sceneId: '5',
        thumb: require('@/assets/images/sample1.jpg'),
        labels: ['Building', 'Tree'],
        duration: '12:25',
    },
    {
        sceneId: '6',
        thumb: require('@/assets/images/sample2.jpg'),
        labels: ['Indoor', 'Tree'],
        duration: '7:14',
    },
];
const TAGS = ['All', 'Tree', 'Indoor', 'Building', 'Dog', 'Person'];

export default function ScenesScreen() {
    // const { id } = useLocalSearchParams<{ id: string }>();
    const player = useVideoPlayer(mov1, (p) => {
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

    // 時間表示
    const formatTime = (seconds: number): string => {
        const total = Math.floor(seconds);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(h)}:${pad(m)}:${pad(s)}`;
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
            if (player.duration > 0) {
                setDuration(player.duration);
                setProgress(currentTime / player.duration);
                setIsReady(true);   // ← durationが取れてる時点でシーク可能とみなす
            }
        });
        const statusSub = player.addListener('statusChange', ({ status }) => {
            setIsReady(status === 'readyToPlay');
        });

        return () => {
            playingSub.remove();
            timeSub.remove();
            statusSub.remove();
        };
    }, [player]);

    // 再生/停止の切り替え
    const togglePlay = () => {
        if (isPlaying) {
            player.pause();
        } else {
            player.play();
        }
    };

    // バーがタップされたら再生位置を変える
    const handleSeek = (e: GestureResponderEvent) => {
        const duration = player.duration;
        // barWidthが未確定、またはdurationが未取得なら何もしない
        if (!barWidth || !Number.isFinite(duration) || duration <= 0) return;

        const ratio = Math.min(Math.max(e.nativeEvent.locationX / barWidth, 0), 1);
        const nextTime = ratio * duration;

        if (!Number.isFinite(nextTime)) return; // NaN, Infinityのような有限な数値でない場合return

        player.currentTime = nextTime;
        setProgress(ratio); // UIに反映
    };

    // 絞り込み検索で選択されているタグ(複数選択は現状できない)
    const [activeTag, setActiveTag] = useState('All');

    // タイムライン追加候補として選択されているシーン
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // 選択シーンがあるかどうか
    const isDisabled = selectedIds.size === 0;

    // タグの絞り込み
    const filteredScenes =
        activeTag === 'All' ? SCENES : SCENES.filter((s) => s.labels.includes(activeTag));

    // 表示中の全シーンが選択済みかどうか
    const allSelected =
        filteredScenes.length > 0 && filteredScenes.every((s) => selectedIds.has(s.sceneId));

    const toggleAll = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            filteredScenes.forEach((s) => (allSelected ? next.delete(s.sceneId) : next.add(s.sceneId)));
            return next;
        });
    };

    const toggleOne = (sceneId: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.has(sceneId) ? next.delete(sceneId) : next.add(sceneId);
            return next;
        });
    };

    const removeScene = (sceneId: string) => {
        setSelectedIds((prev) => {
            const updated = new Set(prev); // 現在の状態をコピー
            updated.delete(sceneId);
            return updated;
        });
    };

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
            <View className="bg-black mx-6 mb-2 aspect-video overflow-hidden rounded-xl">
                <VideoView
                    player={player}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="contain"
                    nativeControls={false}
                />
            </View>
            <View className="h-8 mb-2 flex-row items-center justify-center">
                {/* 再生ボタン */}
                <Pressable onPress={togglePlay} hitSlop={8}>
                    <MaterialCommunityIcons
                        name={isPlaying ? 'pause' : 'play'}
                        size={32}
                        color="#262626"
                    />
                </Pressable>
                <View
                    className="relative w-4/5"
                    onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
                >
                    {/* 時間表示 */}
                    <Text className="absolute bottom-4 left-0 text-[10px] text-gray-500">
                        {formatTime(progress * duration)} / {formatTime(duration)}
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
                        className={`rounded-md px-4 py-1.5 shadow-md shadow-gray-100 ${activeTag === tag ? 'bg-primary' : 'bg-slate-100'}`}
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
                <Pressable onPress={toggleAll} className="flex-row items-center gap-2">
                    <Text className="text-xs text-gray-400">全選択</Text>
                    {/* <View
                        className={`h-5 w-5 items-center justify-center rounded-full border ${allSelected ? 'border-cyan-400 bg-cyan-400' : 'border-gray-300'
                            }`}
                    >
                        {allSelected && <Ionicons name="checkmark" size={14} color="white" />}
                    </View> */}
                    <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                    />
                </Pressable>
            </View>

            <ScrollView>
                {/* シーン一覧 */}
                <FlatList
                    data={filteredScenes}
                    keyExtractor={(s) => s.sceneId}
                    className="flex-1"
                    contentContainerClassName="px-4 pb-12 gap-3"
                    renderItem={({ item }) => {
                        const selected = selectedIds.has(item.sceneId);
                        return (
                            <Pressable
                                onPress={() => toggleOne(item.sceneId)}
                                className={`p-2 mx-2 h-18 flex-row items-center gap-3 rounded-lg border-2 shadow-md shadow-gray-100 ${selected ? 'border-primary' : 'border-gray-200'
                                    }`}
                            >
                                <Image
                                    source={item.thumb}
                                    style={{ width: 96, height: 52 }}
                                    className="h-16 w-24 rounded-sm"
                                    resizeMode="cover" />
                                {/* <Text className="text-xs text-[#262626]">
                                    {item.labels.join(' / ')}</Text> */}
                                <View className=" mx-2 grow-0 flex-row justify-center items-center gap-2 px-4 py-2">
                                    {item.labels.map((tag) => (
                                        <View
                                            key={tag}
                                            className="rounded-md px-3 py-1 shadow-md shadow-gray-100 bg-slate-100"
                                        >
                                            <Text className="text-sm font-semibold text-[#262626]">
                                                {tag}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </Pressable>
                        );
                    }}
                />
            </ScrollView>

            {/* 選択シーンを確認するフッター */}
            <View className="w-full h-28 px-4 gap-3 flex-row items-center justify-center bg-white shadow-md shadow-gray-200">
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="flex-1"
                    contentContainerClassName="items-center gap-3 py-3 pr-2"
                >
                    {[...selectedIds].map((id) => {
                        const scene = SCENES.find((s) => s.sceneId === id);
                        if (!scene) return null;   // 念のためのガード
                        return (
                            <View key={scene.sceneId} className="relative">
                                <Image
                                    source={scene.thumb}
                                    style={{ width: 58, height: 58 }}
                                    className="rounded-sm"
                                    resizeMode="cover"
                                />
                                {/* 削除ボタン */}
                                <Pressable
                                    className="absolute -top-2 -right-2"
                                    onPress={() => removeScene(scene.sceneId)}
                                    hitSlop={8}
                                >
                                    <View className="absolute top-[4px] left-[4px] w-[16px] h-[16px] bg-white rounded-full" />
                                    <MaterialCommunityIcons name="close-circle" size={24} color="black" />
                                </Pressable>
                            </View>
                        )
                    })}
                </ScrollView>
                <View className="items-center justify-center gap-2">
                    <View className="flex-row items-baseline gap-1">
                        <Text className="mr-2 text-xs text-gray-500">選択中</Text>
                        <Text className="text-xl font-bold">{selectedIds.size}</Text>
                        <Text className="text-xs text-gray-500">/ {SCENES.length}</Text>
                    </View>
                    <GradientButton
                        label="シーンを切り抜く"
                        textStyle={{ fontSize: 16, paddingHorizontal: 6, paddingVertical: 0 }}
                        style={{ opacity: isDisabled ? 0.4 : 1 }}
                        onPress={() =>
                            isDisabled ? () => { } : () =>
                                router.push({
                                    pathname: '/project/[id]/editor',
                                    params: { id: '123' },
                                })
                        }
                    />
                </View>
            </View>

        </SafeAreaView >
    );
}
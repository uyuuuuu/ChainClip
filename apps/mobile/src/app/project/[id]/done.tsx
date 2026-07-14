import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useProjectStatus } from '@/hooks/useProjectStatus';
import { router, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect } from 'react';
import { Share, View } from 'react-native';

export default function DoneScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();

    // rendering→completed を polling。completed で finalVideoUrl / shareUrl が返る。
    const { data: project } = useProjectStatus(id);
    const status = project?.status;
    const finalVideoUrl = project?.finalVideoUrl ?? null;
    const shareUrl = project?.shareUrl ?? null;

    // 完成動画のプレビュー再生。URLが来たら差し替える。
    const player = useVideoPlayer(null, (p) => {
        p.loop = false;
    });
    useEffect(() => {
        if (finalVideoUrl) {
            player.replaceAsync(finalVideoUrl).catch((e) =>
                console.warn('完成動画の読み込みに失敗:', e)
            );
        }
    }, [finalVideoUrl, player]);

    // 共有URLを端末の共有シートで開く
    async function handleShare() {
        if (!shareUrl) return;
        try {
            await Share.share({ message: shareUrl, url: shareUrl });
        } catch (e) {
            console.warn('共有に失敗:', e);
        }
    }

    return (
        <View className="flex-1 items-center justify-center gap-6 bg-background px-8">

            {/* 画面名 */}
            <Text variant="h2" className="text-center">
                6.出力完了画面
            </Text>

            {status === 'completed' ? (
                <>
                    {/* 完成動画プレビュー */}
                    <View className="w-full aspect-video overflow-hidden rounded-xl bg-black">
                        <VideoView
                            player={player}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="contain"
                        />
                    </View>

                    <View className="w-full gap-3">
                        <Button onPress={handleShare} disabled={!shareUrl}>
                            <Text>共有する</Text>
                        </Button>
                        {shareUrl && (
                            <Text className="text-xs text-gray-500 text-center" numberOfLines={1}>
                                {shareUrl}
                            </Text>
                        )}
                    </View>
                </>
            ) : status === 'failed' ? (
                <View className="items-center gap-2">
                    <Text className="text-red-500 font-bold">出力に失敗しました</Text>
                    {project?.errorMessage && (
                        <Text className="text-xs text-gray-500 text-center" numberOfLines={3}>
                            {project.errorMessage}
                        </Text>
                    )}
                </View>
            ) : (
                <Text className="text-gray-500">完成動画を生成中…</Text>
            )}

            {/* 画面遷移ボタン */}
            <View className="w-full gap-3">
                <Button variant="outline" onPress={() => router.replace('/project/create')}>
                    <Text>プロジェクト作成画面へ</Text>
                </Button>
            </View>
        </View>
    );
}

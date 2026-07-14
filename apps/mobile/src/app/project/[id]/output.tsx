import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useStartRender } from '@/hooks/useStartRender';
import { useEditStore } from '@/stores/editStore';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

export default function OutputScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();

    // タイトル・説明（任意）。空欄なら null で送る。
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    const startRender = useStartRender();
    const reset = useEditStore((s) => s.reset);

    // render を起動し、完了(rendering→completed)は done 側で polling する
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

    return (
        <View className="flex-1 justify-center gap-6 bg-background px-8">

            {/* 画面名 */}
            <Text variant="h2" className="text-center">
                5.出力設定画面
            </Text>

            {/* タイトル・説明入力（任意） */}
            <View className="w-full gap-3">
                <TextInput
                    className="border border-gray-300 rounded-md px-3 py-2"
                    placeholder="タイトル（任意）"
                    value={title}
                    onChangeText={setTitle}
                />
                <TextInput
                    className="border border-gray-300 rounded-md px-3 py-2"
                    placeholder="説明（任意）"
                    value={description}
                    onChangeText={setDescription}
                    multiline
                />
            </View>

            {/* 画面遷移ボタン */}
            <View className="w-full gap-3">
                <Button onPress={handleRender} disabled={startRender.isPending}>
                    <Text>{startRender.isPending ? '出力中…' : '完成動画を出力する'}</Text>
                </Button>

                {startRender.isError && (
                    <Text className="text-xs text-red-500" numberOfLines={2}>
                        失敗: {String(startRender.error)}
                    </Text>
                )}

                <Button
                    variant="outline"
                    onPress={() => router.push({
                        pathname: '/project/[id]/editor',
                        params: { id },
                    })}
                >
                    <Text>編集（カット一覧）へ</Text>
                </Button>

            </View>

        </View>
    );
}

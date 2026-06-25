import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function ScenesScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();

    return (
        <View className="flex-1 items-center justify-center gap-6 bg-background px-8">

            {/* 画面名 */}
            <Text variant="h2" className="text-center">
                6.出力完了画面
            </Text>

            {/* 画面遷移ボタン */}
            <View className="w-full gap-3">
                <Button onPress={() => router.push('/project/create')}>
                    <Text>プロジェクト作成画面へ</Text>
                </Button>
            </View>
        </View>
    );
}
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

export default function ScenesScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();

    return (
        <View className="flex-1 items-center justify-center gap-6 bg-background px-8">

            {/* 画面名 */}
            <Text variant="h2" className="text-center">
                3.編集画面（カット一覧）
            </Text>

            {/* 画面遷移ボタン */}
            <View className="w-full gap-3">
                <Button
                    onPress={() => router.push({
                        pathname: '/project/[id]/output',
                        params: { id },
                    })}
                >
                    <Text>出力設定へ</Text>
                </Button>

                {/* <Button
                    variant="outline"
                    onPress={() => router.push({
                        pathname: '/project/[id]/cut/[cutId]',
                        params: { id, cutId: 'cut1' },
                    })}>
                    <Text>編集（カット編集）へ</Text>
                </Button> */}

                <Button
                    variant="outline"
                    onPress={() => router.push({
                        pathname: '/project/[id]/scenes',
                        params: { id },
                    })}>
                    <Text>シーン選択へ</Text>
                </Button>
            </View>

        </View>
    );
}
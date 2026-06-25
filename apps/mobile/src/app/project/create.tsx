import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function CreateScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-6 bg-background px-8">

      {/* 画面名 */}
      <Text variant="h2" className="text-center">
        1.プロジェクト作成画面
      </Text>

      {/* 画面遷移ボタン */}
      <View className="w-full gap-3">
        <Button onPress={() => router.push({
          pathname: '/project/[id]/scenes',
          params: { id: '123' },
        })}>
          <Text>シーン選択へ</Text>
        </Button>
      </View>
    </View>
  );
}
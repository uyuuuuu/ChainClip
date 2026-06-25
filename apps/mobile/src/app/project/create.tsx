import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useCreateProject } from '@/hooks/useCreateProject';

export default function CreateScreen() {
  const createProject = useCreateProject();
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

      {/* プロジェクト生成ボタン */}
      <View className="w-full gap-3">
        <Button
          variant="outline"
          onPress={() => createProject.mutate({ aspectRatio: '9:16' })}>
          {!createProject.isPending && !createProject.isSuccess && !createProject.isError &&
            <Text>"プロジェクト作成ボタン"</Text>}
          {createProject.isPending && <Text>作成中...</Text>}
          {createProject.isSuccess && <Text>OK: {createProject.data.projectId}</Text>}
          {createProject.isError && <Text>失敗: {String(createProject.error)}</Text>}
        </Button>
      </View>
    </View>
  );
}
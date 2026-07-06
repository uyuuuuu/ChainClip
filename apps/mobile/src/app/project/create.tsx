import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useCreateProject } from '@/hooks/useCreateProject';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from "react-native-safe-area-context";

export default function CreateScreen() {
  const createProject = useCreateProject();
  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-12 py-8">
      {/* 画面名 */}
      <Text className="text-center text-lg font-bold text-gray-700 my-12">
        このへんにロゴ
      </Text>

      {/* シーン生成(解析開始)ボタン */}
      <View className="w-full gap-3">
        <Button onPress={() => router.push({
          pathname: '/project/[id]/scenes',
          params: { id: '123' },
        })}>
          <Text>動画をアップロード</Text>
        </Button>
      </View>

      {/* プロジェクト生成ボタン */}
      {/* <View className="w-full gap-3">
        <Button
          variant="outline"
          onPress={() => createProject.mutate({ aspectRatio: '9:16' })}>
          {!createProject.isPending && !createProject.isSuccess && !createProject.isError &&
            <Text>"プロジェクト作成ボタン"</Text>}
          {createProject.isPending && <Text>作成中...</Text>}
          {createProject.isSuccess && <Text>OK: {createProject.data.projectId}</Text>}
          {createProject.isError && (
            <Text style={{ fontSize: 10 }}>
              失敗: {String(createProject.error)}
            </Text>
          )}
        </Button>
      </View> */}
      </ScrollView>
    </SafeAreaView>
  );
}

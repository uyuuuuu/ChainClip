import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useCreateProject } from '@/hooks/useCreateProject';
import { router } from 'expo-router';
import { Image, ScrollView, View } from 'react-native';
import { SafeAreaView } from "react-native-safe-area-context";

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import logo from "../../../assets/images/chainclip_logo.png";

export default function CreateScreen() {
  const createProject = useCreateProject();
  return (
    <SafeAreaView className="w-full flex-1 bg-white">
      <ScrollView contentContainerClassName="px-12 py-8 items-center">
        {/* ロゴ */}
        <Image source={logo} className="w-64 h-64" resizeMode="contain" />

        <Text className="text-center text-2xl font-bold text-[#029FFF] mt-8 mb-12">
          思い出の動画をまとめよう
        </Text>

        <View className="gap-4 my-12">
          {/* 動画アップロードボタン */}
          <Button className="py-16 self-center px-4 gap-1 flex flex-col justify-center items-center" onPress={() => router.push({
            pathname: '/project/[id]/scenes',
            params: { id: '123' },
          })}>
            <MaterialCommunityIcons name="upload" size={68} color="white" />
            <Text className="text-lg">動画をアップロード</Text>
          </Button>
          <Text className="text-xs text-gray-500">ファイルサイズは1アイテムあたり〇GBまでです。</Text>
        </View>

        {/* 仮ページ遷移ボタン */}
        <Button className="mb-4" onPress={() => router.push({
          pathname: '/project/[id]/scenes',
          params: { id: '123' },
        })}>
          <Text className="text-lg">(仮)シーン選択画面へ</Text>
        </Button>

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

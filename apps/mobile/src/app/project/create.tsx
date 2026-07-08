import { Button } from '@/components/ui/button';
import { GradientButton } from '@/components/ui/gradientButton';
import { Progress } from "@/components/ui/progress";
import { Text } from '@/components/ui/text';
import { useCreateProject } from '@/hooks/useCreateProject';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from "react-native-safe-area-context";
// 画面状態（アップロード前、アップロード後、解析中、解析完了(いらないかも)、解析失敗）
type ClipStatus = 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed';

type PickedVideo = {
  videoUri: string;      // 動画本体の端末内URI
  thumbnailUri: string;  // 生成したサムネ画像のURI
  durationMs: number;
  fileName: string;
};

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import logo from "../../../assets/images/chainclip_logo.png";

export default function CreateScreen() {
  // アップロードした動画
  const [videos, setVideos] = useState<PickedVideo[]>([]);
  // 画面進行状態
  const [status, setStatus] = useState<ClipStatus>('uploading');
  // 解析進捗
  const [progress, setProgress] = useState(0);

  // プロジェクト作成
  const createProject = useCreateProject();

  // 端末から動画のアップロード
  async function pickVideos() {
    // 端末の写真ライブラリを開く
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'], // ビデオのみ選択可
      allowsMultipleSelection: true,
    });
    if (result.canceled) return; // 選択をキャンセルした場合

    // 動画データの配列
    const picked: PickedVideo[] = [];
    // サムネ生成
    for (const asset of result.assets) {
      try {
        const { uri: thumbnailUri } = await VideoThumbnails.getThumbnailAsync(
          asset.uri,
          { time: 0, quality: 0.7 }
        );
        picked.push({
          videoUri: asset.uri,
          thumbnailUri,
          durationMs: asset.duration ?? 0,
          fileName: asset.fileName ?? 'unknown.mov',
        });
      } catch (e) {
        console.warn('サムネ生成に失敗:', asset.fileName, e);
      }
    }
    // アップロード一覧に追加
    setVideos((prev) => [...prev, ...picked]);
  }

  // アップロード取り消し
  const removeVideo = (videoUri: string) => {
    const updated = videos.filter((v) => v.videoUri !== videoUri);
    setVideos(updated);
    // もしアップロード動画が0になったらアップロード画面に変える
    if (updated.length === 0) setStatus('uploading');
  };

  // 【仮】：プログレスバーのタイマー
  useEffect(() => {
    if (status !== 'processing') return;

    const timer = setInterval(() => {
      setProgress((prev) => Math.min(prev + 0.05, 1)); // 1を超えないようにする
    }, 500);

    return () => clearInterval(timer);
  }, [status]);

  // 進捗が満タンになったら遷移する
  useEffect(() => {
    if (status === 'processing' && progress >= 1) {
      router.replace({
        pathname: '/project/[id]/scenes',
        params: { id: '123' },
      });
    }
  }, [status, progress]);

  return (
    <SafeAreaView className="w-full flex-1 bg-white">
      {/* ロゴ */}
      <View className="px-12 py-8 items-center">
        <Image source={logo} className="w-64 h-64" resizeMode="contain" />
      </View>

      <ScrollView contentContainerClassName="px-12 pb-8">
        {/* アップロード前 */}
        {status === 'uploading' &&
          <View className="gap-4 my-12 flex flex-col justify-center items-center">
            <Text className="text-center text-2xl font-bold text-[#029FFF] mt-8 mb-12">
              思い出の動画をまとめる
            </Text>
            {/* 動画アップロードボタン */}
            <Button className="py-16 self-center px-4 gap-1 flex flex-col justify-center items-center"
              onPress={pickVideos}>
              <MaterialCommunityIcons name="upload" size={68} color="white" />
              <Text className="text-lg">動画をアップロード</Text>
            </Button>
            <Text className="text-xs text-gray-500">ファイルサイズは1アイテムあたり〇GBまでです。</Text>

            {/* プロジェクト生成ボタン */}
            <Button
              variant="outline"
              onPress={() => createProject.mutate()}>
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
          </View>
        }

        {/* アップロード後 */}
        {((status === 'uploaded' || status === 'processing') && videos.length !== 0) && (
          <View className="w-full flex-row flex-wrap justify-between pt-4">
            {videos.map((v) => (
              <View
                key={v.videoUri}
                className="relative w-[44%] h-36 mb-8 items-center justify-center"
              >
                {/* 画像 */}
                <Image
                  source={{ uri: v.thumbnailUri }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover" // containだとサムネ全体が表示される
                />
                {/* 削除ボタン */}
                <Pressable
                  className="absolute -top-4 -right-4 flex justify-center items-center"
                  onPress={() => removeVideo(v.videoUri)}
                  hitSlop={10}
                >
                  <View className="absolute top-[6px] left-[6px] w-[24px] h-[24px] bg-white rounded-full" />
                  <MaterialCommunityIcons name="close-circle" size={36} color="black" />
                </Pressable>
              </View>
            ))}
            <Pressable
              className="w-[44%] h-36 mb-8 items-center justify-center border-2 bg-gray-100 border-dotted border-gray-600"
              onPress={pickVideos}
            >
              <MaterialCommunityIcons name="plus-circle" size={56} color="#4b5563" />
            </Pressable>
          </View>
        )}

      </ScrollView>

      {/* 解析中のオーバーレイ */}
      {status === 'processing' && (
        <View className="absolute inset-0 bg-white/70" />
      )}

      {/* アップロード後 */}
      {(status === 'uploaded' || status === 'processing') && (
        <View className="w-full h-32 flex items-center justify-center bg-white">
          {status === 'uploaded' && (
            <GradientButton
              label="シーンを生成する"
              style={{ width: "80%" }}
              textStyle={{ fontSize: 24 }}
              onPress={() =>
                setStatus('processing')
              }
            />)}
          {status === 'processing' && (
            <View className="w-full flex flex-col justify-center items-center">
              <Text className="text-xs mb-2 text-gray-500">終了次第ポップアップ通知でお知らせします。</Text>
              <GradientButton
                label="動画を解析中…"
                style={{ width: "80%", height: '80%' }}
                textStyle={{ fontSize: 24 }}
                onPress={() =>
                  router.push({
                    pathname: "/project/[id]/scenes",
                    params: { id: "123" },
                  })
                }
              />
              <Progress
                className="w-5/6 h-1"
                value={progress * 100}
              />
            </View>
          )}
        </View>
      )}
    </SafeAreaView >
  );
}

import { Button } from '@/components/ui/button';
import { GradientButton } from '@/components/ui/gradientButton';
import { Progress } from "@/components/ui/progress";
import { Text } from '@/components/ui/text';
import { useCreateProject } from '@/hooks/useCreateProject';
import { useRequestUploadUrls } from '@/hooks/useRequestUploadUrls';
import { useStartPrepare } from '@/hooks/useStartPrepare';
import { useUploadClips, type ClipUploadTarget } from '@/hooks/useUploadClips';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from "react-native-safe-area-context";
// 画面状態（アップロード前、アップロード後、解析中、解析完了(いらないかも)、解析失敗）
type ClipStatus = 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed';

type PickedVideo = {
  videoUri: string;      // 動画本体の端末内URI
  thumbnailUri: string;  // 生成したサムネ画像のURI
  durationMs: number;
  fileName: string;
  contentType: string;   // 署名付きURL発行/アップロードで一致必須
  sizeBytes: number;     // upload-urls のバリデーション用
};

// 拡張子から content-type を推定する（asset.mimeType が取れない端末向けのフォールバック）
function guessContentType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'mov' || ext === 'qt') return 'video/quicktime';
  return 'video/mp4';
}

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import logo from "../../../assets/images/icon.png";

export default function CreateScreen() {
  // アップロードした動画
  const [videos, setVideos] = useState<PickedVideo[]>([]);
  // 画面進行状態
  const [status, setStatus] = useState<ClipStatus>('uploading');
  // 解析進捗
  const [progress, setProgress] = useState(0);
  // エラーメッセージ（パイプライン失敗時）
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // プロジェクト作成〜prepare 起動までの各ステップ
  const createProject = useCreateProject();
  const requestUploadUrls = useRequestUploadUrls();
  const uploadClips = useUploadClips();
  const startPrepare = useStartPrepare();

  // 端末から動画のアップロード
  async function pickVideos() {
    // 端末の写真ライブラリを開く
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'], // ビデオのみ選択可
      allowsMultipleSelection: true,
        preferredAssetRepresentationMode:
            ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
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
        const fileName = asset.fileName ?? 'unknown.mov';
        picked.push({
          videoUri: asset.uri,
          thumbnailUri,
          durationMs: asset.duration ?? 0,
          fileName,
          contentType: asset.mimeType ?? guessContentType(fileName),
          sizeBytes: asset.fileSize ?? 0,
        });
      } catch (e) {
        console.warn('サムネ生成に失敗:', asset.fileName, e);
      }
    }
    // アップロード一覧に追加
    setVideos((prev) => [...prev, ...picked]);
    if (picked.length > 0) setStatus('uploaded');
  }

  // アップロード取り消し
  const removeVideo = (videoUri: string) => {
    const updated = videos.filter((v) => v.videoUri !== videoUri);
    setVideos(updated);
    // もしアップロード動画が0になったらアップロード画面に変える
    if (updated.length === 0) setStatus('uploading');
  };

  // シーン生成：プロジェクト作成 → アップロードURL発行 → GCSアップロード → prepare起動 → scenesへ
  // 各ステップの進捗をおおまかにバーへ反映する。失敗したら uploaded 画面へ戻してエラー表示。
  async function startPipeline() {
    if (videos.length === 0) return;
    setStatus('processing');
    setProgress(0);
    setErrorMessage(null);

    try {
      // 1. プロジェクト作成（accessTokenはhook内でsecure-storeに保存される）
      const { projectId } = await createProject.mutateAsync();
      setProgress(0.15);

      // 2. clipごとの署名付きアップロードURLを発行
      const targets = await requestUploadUrls.mutateAsync({
        projectId,
        clips: videos.map((v) => ({
          originalFilename: v.fileName,
          contentType: v.contentType,
          sizeBytes: v.sizeBytes,
        })),
      });
      setProgress(0.3);

      // 3. 発行されたURLへ端末動画をアップロードし、完了通知する
      //    clipIndex（=pick順）で videos と対応付ける。contentTypeは発行時と一致必須。
      const items: ClipUploadTarget[] = targets.map((target) => ({
        target,
        videoUri: videos[target.clipIndex].videoUri,
        contentType: videos[target.clipIndex].contentType,
      }));
      // アップロードは所要時間が長いので、実際の進捗を 0.3〜0.7 の区間へ反映する
      await uploadClips.mutateAsync({
        projectId,
        items,
        onProgress: (ratio) => setProgress(0.3 + ratio * 0.4),
      });
      setProgress(0.7);

      // 4. prepare worker を起動（status = preparing）
      await startPrepare.mutateAsync({ projectId });
      setProgress(1);

      // 5. シーン選択画面へ。以降の preparing→ready は scenes 側で polling する
      router.replace({
        pathname: '/project/[id]/scenes',
        params: { id: projectId },
      });
    } catch (e) {
      setErrorMessage(String(e));
      setStatus('uploaded');
      setProgress(0);
    }
  }

  return (
    <SafeAreaView className="w-full flex-1 bg-white">
      {/* ロゴ */}
      <View className="px-12 py-8 items-center">
        <Image source={logo} className="w-32 h-32" resizeMode="contain" />
      </View>

      <ScrollView contentContainerClassName="px-12 pb-8">
        {/* アップロード前 */}
        {status === 'uploading' &&
          <View className="gap-4 my-4 flex flex-col justify-center items-center">
            <Text className="text-center text-2xl font-bold text-[#029FFF] mb-8">
              思い出の動画をまとめる
            </Text>
            {/* 動画アップロードボタン */}
            <Button className="h-auto py-4 self-center px-4 gap-1 flex flex-col justify-center items-center"
              onPress={pickVideos}>
              <MaterialCommunityIcons name="upload" size={68} color="white" />
              <Text className="text-lg">動画をアップロード</Text>
            </Button>
            <Text className="text-xs text-gray-500">ファイルサイズは1アイテムあたり〇GBまでです。</Text>
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
            <View className="w-full flex flex-col justify-center items-center">
              {errorMessage && (
                <Text className="text-xs mb-2 text-red-500" numberOfLines={2}>
                  失敗: {errorMessage}
                </Text>
              )}
              <GradientButton
                label="シーンを生成する"
                style={{ width: "80%" }}
                textStyle={{ fontSize: 24 }}
                onPress={startPipeline}
              />
            </View>
          )}
          {status === 'processing' && (
            <View className="w-full flex flex-col justify-center items-center">
              <Text className="text-xs mb-2 text-gray-500">アップロードと解析の準備をしています…</Text>
              <GradientButton
                label="準備中…"
                style={{ width: "80%"}}
                textStyle={{ fontSize: 24 }}
                onPress={() => { /* 準備中は操作不可 */ }}
              />
              <Progress
                className="mt-2 w-5/6 h-1"
                value={progress * 100}
              />
            </View>
          )}
        </View>
      )}
    </SafeAreaView >
  );
}

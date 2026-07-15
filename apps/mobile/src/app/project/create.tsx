import { GradientButton } from "@/components/ui/gradientButton";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { useCreateProject } from "@/hooks/useCreateProject";
import { useRequestUploadUrls } from "@/hooks/useRequestUploadUrls";
import { useStartPrepare } from "@/hooks/useStartPrepare";
import { useUploadClips, type ClipUploadTarget } from "@/hooks/useUploadClips";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useState } from "react";
import { Image, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
// 画面状態（アップロード前、アップロード後、解析中、解析完了(いらないかも)、解析失敗）
type ClipStatus = "uploading" | "uploaded" | "processing" | "ready" | "failed";

type PickedVideo = {
  videoUri: string; // 動画本体の端末内URI
  thumbnailUri: string; // 生成したサムネ画像のURI
  durationMs: number;
  fileName: string;
  contentType: string; // 署名付きURL発行/アップロードで一致必須
  sizeBytes: number; // upload-urls のバリデーション用
};

// 拡張子から content-type を推定する（asset.mimeType が取れない端末向けのフォールバック）
function guessContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "mov" || ext === "qt") return "video/quicktime";
  return "video/mp4";
}

import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import logo from "../../../assets/images/icon.png";

// グリッドの列数・列間の余白(px)
const GRID_COLUMNS = 3;
const GRID_GAP = 12;

export default function CreateScreen() {
  // アップロードした動画
  const [videos, setVideos] = useState<PickedVideo[]>([]);
  // サムネグリッド1マスの一辺(px)。aspectRatioだと削除直後の再レイアウトでたまに潰れて見えるため、
  // 実測せず画面幅から計算したpx値を明示的に指定して安定させる
  const { width: windowWidth } = useWindowDimensions();
  const gridContentWidth = windowWidth - 24 * 2; // ScrollViewのpx-6(左右24px)ぶんを引く
  const gridCellSize =
    (gridContentWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  // 画面進行状態
  const [status, setStatus] = useState<ClipStatus>("uploading");
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
      mediaTypes: ["videos"], // ビデオのみ選択可
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
          { time: 0, quality: 0.7 },
        );
        const fileName = asset.fileName ?? "unknown.mov";
        picked.push({
          videoUri: asset.uri,
          thumbnailUri,
          durationMs: asset.duration ?? 0,
          fileName,
          contentType: asset.mimeType ?? guessContentType(fileName),
          sizeBytes: asset.fileSize ?? 0,
        });
      } catch (e) {
        console.warn("サムネ生成に失敗:", asset.fileName, e);
      }
    }
    // アップロード一覧に追加
    setVideos((prev) => [...prev, ...picked]);
    if (picked.length > 0) setStatus("uploaded");
  }

  // アップロード取り消し
  const removeVideo = (videoUri: string) => {
    const updated = videos.filter((v) => v.videoUri !== videoUri);
    setVideos(updated);
    // もしアップロード動画が0になったらアップロード画面に変える
    if (updated.length === 0) setStatus("uploading");
  };

  // シーン生成：プロジェクト作成 → アップロードURL発行 → GCSアップロード → prepare起動 → scenesへ
  // 各ステップの進捗をおおまかにバーへ反映する。失敗したら uploaded 画面へ戻してエラー表示。
  async function startPipeline() {
    if (videos.length === 0) return;
    setStatus("processing");
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
        pathname: "/project/[id]/scenes",
        params: { id: projectId },
      });
    } catch (e) {
      setErrorMessage(String(e));
      setStatus("uploaded");
      setProgress(0);
    }
  }

  return (
    <SafeAreaView className="w-full flex-1 bg-white">
      {/* ロゴ */}
      <View className="px-12 pt-4 pb-2 items-center">
        <Image source={logo} className="w-44 h-44" resizeMode="contain" />
      </View>

      <ScrollView
        contentContainerClassName="px-6 pb-8"
        showsVerticalScrollIndicator={false}
      >
        {/* アップロード前 */}
        {status === "uploading" && (
          <View className="items-center px-6 pt-6">
            <Text className="text-center text-2xl font-bold text-[#262626]">
              思い出のハイライトを
            </Text>
            <Text className="text-center text-2xl font-bold text-[#262626]">
              1本に繋げよう
            </Text>
            <Text className="text-center text-sm text-gray-400 mt-2 mb-12">
              動画を選んで、皆と「楽しい」を共有する
            </Text>
            {/* 動画アップロードボタン */}
            <Pressable
              className="items-center justify-center gap-4 active:opacity-80"
              onPress={pickVideos}
            >
              <LinearGradient
                colors={["#00D5FF", "#00E6E6"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 128,
                  height: 128,
                  borderRadius: 64,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#00D5FF",
                  shadowOpacity: 0.3,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 6,
                }}
              >
                <MaterialCommunityIcons
                  name="video-plus"
                  size={52}
                  color="white"
                />
              </LinearGradient>
              <Text className="text-base font-semibold text-[#262626]">
                動画を選ぶ
              </Text>
            </Pressable>
          </View>
        )}

        {/* アップロード後 */}
        {(status === "uploaded" || status === "processing") &&
          videos.length !== 0 && (
            <View>
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-lg font-semibold text-[#262626]">
                  選択した動画
                </Text>
                <Text className="text-sm text-gray-400">{videos.length}本</Text>
              </View>
              <View
                className="w-full flex-row flex-wrap"
                style={{ columnGap: GRID_GAP, rowGap: GRID_GAP }}
              >
                {videos.map((v) => (
                  <View
                    key={v.videoUri}
                    className="relative items-center justify-center"
                    style={{ width: gridCellSize, height: gridCellSize }}
                  >
                    {/* 画像 */}
                    <Image
                      source={{ uri: v.thumbnailUri }}
                      style={{ width: "100%", height: "100%" }}
                      className="rounded-2xl"
                      resizeMode="cover" // containだとサムネ全体が表示される
                    />
                    {/* 削除ボタン */}
                    <Pressable
                      className="absolute -top-2 -right-2 flex justify-center items-center"
                      onPress={() => removeVideo(v.videoUri)}
                      hitSlop={10}
                    >
                      <View className="absolute top-[5px] left-[5px] w-[20px] h-[20px] bg-white rounded-full" />
                      <MaterialCommunityIcons
                        name="close-circle"
                        size={28}
                        color="#262626"
                      />
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  className="items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50"
                  style={{ width: gridCellSize, height: gridCellSize }}
                  onPress={pickVideos}
                >
                  <MaterialCommunityIcons
                    name="plus"
                    size={32}
                    color="#9ca3af"
                  />
                </Pressable>
              </View>
            </View>
          )}
      </ScrollView>

      {/* 解析中のオーバーレイ */}
      {status === "processing" && (
        <View className="absolute inset-0 bg-white/70" />
      )}

      {/* アップロード後 */}
      {(status === "uploaded" || status === "processing") && (
        <View
          className="w-full px-6 pt-4 pb-6 items-center bg-white"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.08,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: -2 },
            elevation: 8,
          }}
        >
          {status === "uploaded" && (
            <View className="w-full items-center">
              {errorMessage && (
                <Text className="text-xs mb-2 text-red-500" numberOfLines={2}>
                  失敗: {errorMessage}
                </Text>
              )}
              <GradientButton
                label="シーンを生成する"
                style={{ width: "100%" }}
                textStyle={{ fontSize: 20 }}
                onPress={startPipeline}
              />
            </View>
          )}
          {status === "processing" && (
            <View className="w-full items-center">
              <Text className="text-xs mb-2 text-gray-400">
                アップロードと解析の準備をしています…
              </Text>
              <GradientButton
                label="準備中…"
                style={{ width: "100%" }}
                textStyle={{ fontSize: 20 }}
                onPress={() => {}}
                disabled
              />
              <Progress className="mt-3 w-full h-1" value={progress * 100} />
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

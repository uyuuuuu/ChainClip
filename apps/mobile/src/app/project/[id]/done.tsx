import { Button } from "@/components/ui/button";
import { GradientButton } from "@/components/ui/gradientButton";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { useProjectStatus } from "@/hooks/useProjectStatus";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Directory, File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { Asset } from "expo-media-library";
import { router, useLocalSearchParams } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    GestureResponderEvent,
    Pressable,
    ScrollView,
    Share,
    View,
    useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const DESCRIPTION_LINE_HEIGHT = 24;
// 説明文の表示エリアの高さ(px)
const DESCRIPTION_HEIGHT = DESCRIPTION_LINE_HEIGHT * 3;

// 時間表示（秒 → 00:00:00
const formatTime = (seconds: number): string => {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

export default function DoneScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: project, isError, refetch } = useProjectStatus(id);
  const status = project?.status;
  const title = project?.title ?? "無題";
  const description = project?.description ?? "";
  const finalVideoUrl = project?.finalVideoUrl ?? null;
  const shareUrl = project?.shareUrl ?? null;

  const player = useVideoPlayer(finalVideoUrl, (p) => {
    p.timeUpdateEventInterval = 0.25;
    p.loop = false;
  });
  useEffect(() => {
    if (finalVideoUrl) {
      player
        .replaceAsync(finalVideoUrl)
        .catch((e) => console.warn("完成動画の読み込みに失敗:", e));
    }
  }, [finalVideoUrl, player]);

  // 正方形コンテナの一辺(px)
  const { width: windowWidth } = useWindowDimensions();
  const playerSize = Math.floor(windowWidth - 48);
  // 再生中かどうか
  const [isPlaying, setIsPlaying] = useState(false);
  // 読み込みできているか（シーク可否の判定に使う）
  const [isReady, setIsReady] = useState(false);
  // 現在の再生位置(ms) と 動画全体の長さ(ms)
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  // シークバーの実際の幅(px)
  const [barWidth, setBarWidth] = useState(0);
  //写真ライブラリへの「保存だけ」の権限（writeOnlyだと聞かれる項目が最小になる）
  const [permission, requestPermission] = MediaLibrary.usePermissions({
    writeOnly: true,
  });
  // 保存処理中かどうか（ボタンの二重押し防止＆表示切り替え用）
  const [isSaving, setIsSaving] = useState(false);

  // プレーヤーの状態をUIに反映
  useEffect(() => {
    const subs = [
      player.addListener("playingChange", ({ isPlaying }) =>
        setIsPlaying(isPlaying),
      ),
      player.addListener("statusChange", ({ status }) => {
        const ready = status === "readyToPlay";
        setIsReady(ready);
        if (ready) {
          // 読み込み完了時に動画の長さを取得（秒 → ms）
          setDurationMs(player.duration * 1000);
          // 開いた直後は真っ黒に見えるため、自動で再生を始める
          player.play();
        }
      }),
      player.addListener("timeUpdate", ({ currentTime }) => {
        setCurrentMs(currentTime * 1000);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player]);

  // 再生 / 停止の切り替え
  const togglePlay = () => {
    if (isPlaying) {
      player.pause();
      return;
    }
    // 最後まで再生し終わっていたら頭に戻してから再生
    if (durationMs > 0 && currentMs >= durationMs - 50) {
      player.currentTime = 0;
    }
    player.play();
  };

  // シークバーがタップされたら、その位置へ再生位置を移動
  const handleSeek = (e: GestureResponderEvent) => {
    if (!barWidth || durationMs <= 0) return;
    const ratio = Math.min(Math.max(e.nativeEvent.locationX / barWidth, 0), 1);
    player.currentTime = (ratio * durationMs) / 1000;
    setCurrentMs(ratio * durationMs); // UIに即反映
  };

  // シークバーの進捗（0〜100）
  const progressValue =
    durationMs > 0 ? Math.min((currentMs / durationMs) * 100, 100) : 0;

  // 「保存する」ボタン
  const handleSave = async () => {
    if (isSaving) return; // 二重押し防止
    if (!finalVideoUrl) return; // 動画URLがまだ無ければ何もしない

    try {
      setIsSaving(true);

      // 保存の許可を確認。無ければユーザーに許可を求める
      let granted = permission?.granted ?? false;
      if (!granted) {
        const res = await requestPermission();
        granted = res.granted;
      }
      if (!granted) {
        Alert.alert(
          "保存できません",
          "設定から写真へのアクセスを許可してください。",
        );
        return;
      }

      // リモートの動画を、いったん端末のキャッシュにダウンロードする
      const dir = new Directory(Paths.cache, "chainclip");
      dir.create({ intermediates: true, idempotent: true }); // フォルダが無ければ作る。あってもエラーにしない
      const target = new File(dir, `chainclip-${id ?? "video"}.mp4`);
      if (target.exists) target.delete(); // 前回の残りがあれば消しておく
      const downloaded = await File.downloadFileAsync(finalVideoUrl, target);

      // ダウンロードしたファイルをカメラロールに保存する
      await Asset.create(downloaded.uri);

      // キャッシュの一時ファイルは不要なので消す
      downloaded.delete();

      Alert.alert("保存しました", "カメラロールに動画を保存しました。");
    } catch (e) {
      console.warn("保存に失敗しました:", e);
      Alert.alert("保存に失敗しました", String(e));
    } finally {
      setIsSaving(false);
    }
  };

  // 「共有する」ボタン
  const handleShare = async () => {
    // 共有する本文を1行ずつ組み立てる
    const lines = ["ChainClipで動画を作成しました！", `「${title}」`, shareUrl];
    const message = lines.join("\n"); // 改行でつなげて1つの文面にする

    try {
      await Share.share({
        message,
        title,
      });
      // ユーザーがキャンセルしてもエラーにはならない
    } catch (e) {
      console.warn("共有に失敗しました:", e);
    }
  };

  return (
    <SafeAreaView className="w-full flex-1 bg-white">
      {status === "completed" ? (
        <>
          {/* ヘッダー */}
          <View className="h-16 flex-row items-center justify-center">
            <Text className="text-base font-bold">動画生成完了</Text>
          </View>
          {/* ビデオプレーヤー */}
          <View className="items-center">
            <View
              className="bg-black overflow-hidden rounded-xl"
              style={{ width: playerSize, height: playerSize }}
            >
              <VideoView
                player={player}
                style={{ width: "100%", height: "100%" }}
                contentFit="contain"
                nativeControls={false}
              />
            </View>
          </View>

          {/* 再生バー */}
          <View className="h-8 my-2 flex-row items-center justify-center gap-2">
            <Pressable onPress={togglePlay} hitSlop={8}>
              <MaterialCommunityIcons
                name={isPlaying ? "pause" : "play"}
                size={32}
                color="#262626"
              />
            </Pressable>
            <View
              className="relative w-9/12"
              onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
            >
              {/* 時間表示 */}
              <Text className="absolute bottom-4 left-0 text-[10px] text-gray-500">
                {formatTime(currentMs / 1000)} / {formatTime(durationMs / 1000)}
              </Text>
              {/* シークバー */}
              <Pressable
                className="py-2"
                onPress={isReady ? handleSeek : undefined}
                style={{ opacity: isReady ? 1 : 0.4 }}
              >
                <Progress className="h-1.5 w-full" value={progressValue} />
              </Pressable>
            </View>
          </View>

          {/* タイトル（1行で表示） */}
          <View className="mx-6 mt-2">
            <Text className="text-xl font-bold text-[#262626] numberOfLines={1}">
              {title}
            </Text>
          </View>

          {/* 説明文 */}
          <View className="mx-6 mt-3" style={{ height: DESCRIPTION_HEIGHT }}>
            <ScrollView showsVerticalScrollIndicator nestedScrollEnabled>
              <Text
                className="text-base text-[#262626]"
                style={{ lineHeight: DESCRIPTION_LINE_HEIGHT }}
              >
                {description}
              </Text>
            </ScrollView>
          </View>

          <View className="flex-1" />

          <View className="mx-6 mt-4 mb-8 flex-row justify-center gap-6">
            <GradientButton
              label={isSaving ? "保存中…" : "保存する"}
              icon={<MaterialCommunityIcons name="content-save" size={24} color="white" />}
              onPress={handleSave}
              disabled={isSaving}
              buttonStyle={{ paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 }}
              textStyle={{ fontSize: 18 }}
            />
            <GradientButton
              label="共有する"
              icon={<MaterialCommunityIcons name="share-variant" size={24} color="white" />}
              onPress={handleShare}
              buttonStyle={{ paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 }}
              textStyle={{ fontSize: 18 }}
            />
          </View>

          {/* ホームへ戻る */}
          <View className="mx-6 mb-4 items-center">
            <Button
              variant="outline"
              className="h-auto py-2 px-6"
              onPress={() => router.push("/project/create")}
            >
              <Text className="font-md">ホームへ</Text>
            </Button>
          </View>
        </>
      ) : status === "failed" ? (
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <Text className="text-red-500 font-bold">出力に失敗しました</Text>
          {project?.errorMessage && (
            <Text
              className="text-xs text-gray-500 text-center"
              numberOfLines={3}
            >
              {project.errorMessage}
            </Text>
          )}
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <Text className="text-red-500 font-bold">通信に失敗しました</Text>
          <Text className="text-xs text-gray-500 text-center">
            電波の良い場所で再度お試しください
          </Text>
          <Pressable
            onPress={() => refetch()}
            className="rounded-lg bg-primary px-6 py-2"
          >
            <Text className="font-bold text-white">再試行</Text>
          </Pressable>
        </View>
      ) : (
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <ActivityIndicator size="large" color="#029FFF" />
          <Text className="text-center text-xl font-bold text-[#029FFF]">
            動画をつなげています…
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

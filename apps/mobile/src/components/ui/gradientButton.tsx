import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text } from "react-native";

export function GradientButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <LinearGradient
        colors={["#00C7F0", "#00D8E6"]}  // 左の色 → 右の色
        start={{ x: 0, y: 0 }}            // グラデーションの開始位置（左上）
        end={{ x: 1, y: 1 }}              // 終了位置（右下）＝横方向のグラデーション
        className="rounded-md px-6 py-3 items-center"
      >
        <Text className="text-white font-bold">{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}
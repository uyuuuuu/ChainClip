import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleProp, Text, TextStyle, ViewStyle } from "react-native";

export function GradientButton({
  label,
  onPress,
  style,       // ボタン全体（入れ物）のスタイル
  textStyle,   // 文字のスタイル
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;      // ? は「渡さなくてもOK」の意味
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <Pressable onPress={onPress} style={style}>
      <LinearGradient
        colors={["#00D5FF", "#00E6E6"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 6,
          paddingHorizontal: 24,
          paddingVertical: 12,
          alignItems: "center",
        }}
      >
        <Text style={[{ color: "white", fontWeight: "bold" }, textStyle]}>
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}
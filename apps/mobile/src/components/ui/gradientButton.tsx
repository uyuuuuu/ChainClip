import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Pressable, StyleProp, Text, TextStyle, ViewStyle } from "react-native";

export function GradientButton({
  label,
  icon,        // ラベルの前に置くアイコン等（あれば横並びになる）
  onPress,
  style,       // ボタン全体（入れ物）のスタイル
  buttonStyle, // ボタンのスタイル
  textStyle,   // 文字のスタイル
  disabled = false,
}: {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  buttonStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={style}>
      <LinearGradient
        colors={["#00D5FF", "#00E6E6"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          {
            borderRadius: 6,
            paddingHorizontal: 24,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: disabled ? 0.4 : 1,
          },
          buttonStyle,
        ]}
      >
        {icon}
        <Text style={[{ color: "white", fontWeight: "bold" }, textStyle]}>
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

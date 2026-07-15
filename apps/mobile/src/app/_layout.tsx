import { PortalHost } from "@rn-primitives/portal";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { Stack } from "expo-router";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import { useEffect } from "react";
import { AppState, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../global.css";

const queryClient = new QueryClient();

// AppStateを繋いでバックグラウンド復帰後にrefetchIntervalを再開
function useAppStateFocus() {
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useAppStateFocus();
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView>
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <QueryClientProvider client={queryClient}>
            <Stack
              screenOptions={{ headerShown: false, gestureEnabled: false }}
            />
            <PortalHost />
          </QueryClientProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

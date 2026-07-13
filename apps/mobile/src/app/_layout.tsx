import { PortalHost } from '@rn-primitives/portal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';

const queryClient = new QueryClient();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <SafeAreaProvider>
        <GestureHandlerRootView>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                <QueryClientProvider client={queryClient}>
                    <Stack screenOptions={{ headerShown: false }} />
                    <PortalHost />
                </QueryClientProvider>
          </ThemeProvider>
        </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

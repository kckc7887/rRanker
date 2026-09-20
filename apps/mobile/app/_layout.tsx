import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSyncAccountMetadata } from '@/hooks/use-sync-account-metadata';
import { useAppStartup } from '@/hooks/use-app-startup';
import { useAppRuntime } from '@/hooks/use-app-runtime';
import { queryClient } from '@/state/query-client';
import { AppLifecycleProvider } from '@/state/app-lifecycle';
import { NotificationProvider } from '@/components/AppNotification';
import { songDetailScreenOptions } from '@/components/game-content/SongDetailScreenOptions';
import { AppThemeProvider, useAppTheme } from '@/theme/app-theme';
import { RemoteImageActivityScope } from '@/components/RemoteImage';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';

export const unstable_settings = { anchor: '(tabs)' };
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const theme = useAppTheme();
  useEffect(() => { recordRuntimeError('screen-render', error); }, [error]);
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16, backgroundColor: theme.background }}>
    <Text style={{ color: theme.text }}>页面暂时无法显示，请重试。</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="重试" onPress={() => void retry()} style={{ padding: 16 }}>
      <Text style={{ color: theme.accent }}>重试</Text>
    </Pressable>
  </View>;
}

export default function RootLayout() {
  return <AppLifecycleProvider><RootLayoutContent /></AppLifecycleProvider>;
}

function RootLayoutContent() {
  const ready = useAppStartup();
  const lifecycle = useAppRuntime(ready);
  if (!ready) {
    return <View style={styles.loading}><ActivityIndicator color="#246BFD" /></View>;
  }

  return (
    <RemoteImageActivityScope active={lifecycle.phase !== 'background'}>
      <QueryClientProvider client={queryClient}>
        <AppThemeProvider><ThemedNavigation /></AppThemeProvider>
      </QueryClientProvider>
    </RemoteImageActivityScope>
  );
}

function ThemedNavigation() {
  useSyncAccountMetadata();
  const theme = useAppTheme();
  const navigationTheme = {
    ...(theme.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.dark ? DarkTheme.colors : DefaultTheme.colors),
      primary: theme.accent, background: theme.background, card: theme.surface,
      text: theme.text, border: theme.border, notification: theme.accent,
    },
  };
  return <ThemeProvider value={navigationTheme}>
    <NotificationProvider>
      <Stack screenOptions={{
        headerBackButtonDisplayMode: 'minimal', headerBackButtonMenuEnabled: false,
        headerStyle: { backgroundColor: theme.surface }, headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.background },
        orientation: 'portrait_up',
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'rRanker' }} />
        <Stack.Screen name="library/index" options={{ title: '我的曲库' }} />
        <Stack.Screen name="game-management" options={{ title: '游戏管理' }} />
        <Stack.Screen name="storage-management" options={{ title: '存储管理' }} />
        <Stack.Screen name="debug" options={{ title: '调试' }} />
        <Stack.Screen name="diagnostics" options={{ title: '诊断' }} />
        <Stack.Screen name="best-image" options={{ title: '成绩图片' }} />
        <Stack.Screen name="songs/[songId]" options={songDetailScreenOptions()} />
        <Stack.Screen name="songs/chart-preview" options={{ title: '谱面确认' }} />
        <Stack.Screen name="songs/phigros-chart-preview" options={{ title: '谱面确认' }} />
        <Stack.Screen name="songs/osu-chart-preview" options={{ title: '谱面确认' }} />
        <Stack.Screen name="songs/rizline-chart-preview" options={{ title: '谱面确认' }} />
        <Stack.Screen name="oauth/lxns" options={{ title: '落雪授权' }} />
        <Stack.Screen name="oauth/osu" options={{ title: 'osu! 授权' }} />
      </Stack>
      <StatusBar style={theme.statusBar} />
    </NotificationProvider>
  </ThemeProvider>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
});

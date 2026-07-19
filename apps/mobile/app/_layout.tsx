import { useEffect } from 'react';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Appearance, AppState, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { queryClient } from '@/state/query-client';
import { restoreSession, useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { DEFAULT_LOCAL_PLAYER_NAME, LocalAccountStore } from '@/storage/local-account-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { useSyncOnAccountSwitch } from '@/hooks/use-sync-on-account-switch';
import { createLocalMaimaiAccount, LOCAL_MAIMAI_ACCOUNT_ID } from '@/domain/bound-account';
import { NotificationProvider } from '@/components/AppNotification';
import { AppThemeProvider, useAppTheme } from '@/theme/app-theme';
import { useThemeStore } from '@/state/theme-store';

const sessions = new SecureSessionStore();
const localAccounts = new LocalAccountStore();
const snapshots = new SqliteSnapshotRepository();

async function loadLocalBoundAccounts() {
  const stored = await localAccounts.load();
  const profiles = stored.some((profile) => profile.id === LOCAL_MAIMAI_ACCOUNT_ID)
    ? stored
    : [{ id: LOCAL_MAIMAI_ACCOUNT_ID, displayName: DEFAULT_LOCAL_PLAYER_NAME }, ...stored];
  return Promise.all(profiles.map(async (profile) => {
    const snapshot = await snapshots.getLatest(profile.id);
    return createLocalMaimaiAccount(profile.displayName, snapshot?.best50.rating ?? 0, profile.id);
  }));
}

function AccountSwitchSync() {
  useSyncOnAccountSwitch();
  return null;
}

export const unstable_settings = { anchor: '(tabs)' };
export default function RootLayout() {
  const restoreStatus = useSession((state) => state.restoreStatus);
  const themeHydrated = useThemeStore((state) => state.hydrated);
  const hydrateTheme = useThemeStore((state) => state.hydrate);
  const appearance = useThemeStore((state) => state.appearance);

  useEffect(() => {
    if (restoreStatus === 'restoring') {
      void restoreSession(() => sessions.loadVault(), loadLocalBoundAccounts);
    }
  }, [restoreStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => { void hydrateTheme(); }, [hydrateTheme]);
  useEffect(() => { Appearance.setColorScheme(appearance === 'system' ? null : appearance); }, [appearance]);

  if (restoreStatus === 'restoring' || !themeHydrated) {
    return <View style={styles.loading}><ActivityIndicator color="#246BFD" /></View>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider><ThemedNavigation /></AppThemeProvider>
    </QueryClientProvider>
  );
}

function ThemedNavigation() {
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
      <AccountSwitchSync />
      <Stack screenOptions={{
        headerBackButtonDisplayMode: 'minimal', headerBackButtonMenuEnabled: false,
        headerStyle: { backgroundColor: theme.surface }, headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.background },
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'rRanker' }} />
        <Stack.Screen name="library/index" options={{ title: '我的曲库' }} />
        <Stack.Screen name="game-management" options={{ title: '游戏管理' }} />
        <Stack.Screen name="best-image" options={{ title: '图片预览' }} />
        <Stack.Screen name="songs/[songId]" options={{ title: '歌曲详情' }} />
      </Stack>
      <StatusBar style={theme.statusBar} />
    </NotificationProvider>
  </ThemeProvider>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
});

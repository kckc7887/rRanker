import { useEffect, useState } from 'react';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Appearance, AppState, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { queryClient } from '@/state/query-client';
import { restoreSession, useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';
import {
  DEFAULT_LOCAL_PLAYER_NAME,
  LocalAccountStore,
  normalizeLocalPlayerName,
} from '@/storage/local-account-store';
import {
  DEFAULT_DEMO_PLAYER_NAME,
  DemoAccountStore,
} from '@/storage/demo-account-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { useSyncOnAccountSwitch } from '@/hooks/use-sync-on-account-switch';
import {
  createLocalMaimaiAccount,
  createMaxedMaimaiTestAccount,
  LOCAL_MAIMAI_ACCOUNT_ID,
} from '@/domain/bound-account';
import { NotificationProvider } from '@/components/AppNotification';
import { AppThemeProvider, useAppTheme } from '@/theme/app-theme';
import { useThemeStore } from '@/state/theme-store';
import { ensureUiIconFontsLoaded } from '@/features/storage-management/ui-icon-fonts';

const sessions = new SecureSessionStore();
const localAccounts = new LocalAccountStore();
const demoAccounts = new DemoAccountStore();
const snapshots = new SqliteSnapshotRepository();

async function loadLocalBoundAccounts() {
  let stored = await localAccounts.load();
  // 旧版会强制注入默认本地玩家但不一定写入 KV；若本机已有该账号快照则迁移一次。
  if (stored.length === 0) {
    const snapshot = await snapshots.getLatest(LOCAL_MAIMAI_ACCOUNT_ID);
    if (snapshot) {
      const displayName = normalizeLocalPlayerName(snapshot.player.displayName)
        ?? DEFAULT_LOCAL_PLAYER_NAME;
      const profile = { id: LOCAL_MAIMAI_ACCOUNT_ID, displayName };
      await localAccounts.upsert(profile);
      stored = [profile];
    }
  }
  return Promise.all(stored.map(async (profile) => {
    const snapshot = await snapshots.getLatest(profile.id);
    return createLocalMaimaiAccount(profile.displayName, snapshot?.best50.rating ?? 0, profile.id);
  }));
}

async function loadDemoBoundAccounts() {
  const stored = await demoAccounts.load();
  return stored.map((profile) => createMaxedMaimaiTestAccount(
    0,
    profile.displayName || DEFAULT_DEMO_PLAYER_NAME,
    profile.id,
  ));
}

async function loadOptionalBoundAccounts() {
  const [locals, demos] = await Promise.all([
    loadLocalBoundAccounts(),
    loadDemoBoundAccounts(),
  ]);
  return [...locals, ...demos];
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
  const [iconFontsReady, setIconFontsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void ensureUiIconFontsLoaded()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIconFontsReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (restoreStatus === 'restoring') {
      void restoreSession(() => sessions.loadVault(), loadOptionalBoundAccounts);
    }
  }, [restoreStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => { void hydrateTheme(); }, [hydrateTheme]);
  useEffect(() => { Appearance.setColorScheme(appearance === 'system' ? null : appearance); }, [appearance]);

  if (restoreStatus === 'restoring' || !themeHydrated || !iconFontsReady) {
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
        <Stack.Screen name="storage-management" options={{ title: '存储管理' }} />
        <Stack.Screen name="best-image" options={{ title: '成绩图片' }} />
        <Stack.Screen name="songs/[songId]" options={{ title: '歌曲详情' }} />
      </Stack>
      <StatusBar style={theme.statusBar} />
    </NotificationProvider>
  </ThemeProvider>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
});

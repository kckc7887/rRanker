import { useEffect } from 'react';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { queryClient } from '@/state/query-client';
import { restoreSession, useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { DEFAULT_LOCAL_PLAYER_NAME, LocalAccountStore } from '@/storage/local-account-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { useSyncOnAccountSwitch } from '@/hooks/use-sync-on-account-switch';
import { createLocalMaimaiAccount, LOCAL_MAIMAI_ACCOUNT_ID } from '@/domain/bound-account';
import { NotificationProvider } from '@/components/AppNotification';

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

  useEffect(() => {
    if (restoreStatus === 'restoring') {
      void restoreSession(() => sessions.loadVault(), loadLocalBoundAccounts);
    }
  }, [restoreStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
    return () => subscription.remove();
  }, []);

  if (restoreStatus === 'restoring') {
    return <View style={styles.loading}><ActivityIndicator color="#246BFD" /></View>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <AccountSwitchSync />
        <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerBackButtonMenuEnabled: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'rRanker' }} />
          <Stack.Screen name="library/index" options={{ title: '我的曲库' }} />
          <Stack.Screen name="game-management" options={{ title: '游戏管理' }} />
          <Stack.Screen name="best-image" options={{ title: '图片预览' }} />
          <Stack.Screen name="songs/[songId]" options={{ title: '歌曲详情' }} />
        </Stack>
        <StatusBar style="dark" />
      </NotificationProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
});

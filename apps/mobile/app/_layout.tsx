import { useEffect } from 'react';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { queryClient } from '@/state/query-client';
import { restoreSession, useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';

const sessions = new SecureSessionStore();

export const unstable_settings = { anchor: '(tabs)' };
export default function RootLayout() {
  const restoreStatus = useSession((state) => state.restoreStatus);

  useEffect(() => {
    if (restoreStatus === 'restoring') void restoreSession(() => sessions.load());
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
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerBackButtonMenuEnabled: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'rRanker' }} />
        <Stack.Screen name="library/index" options={{ title: '我的曲库' }} />
        <Stack.Screen name="songs/[songId]" options={{ title: '歌曲详情' }} />
      </Stack>
      <StatusBar style="dark" />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
});

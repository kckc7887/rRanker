import { useEffect, useRef, useState } from 'react';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Image as ExpoImage } from 'expo-image';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Appearance, InteractionManager, StyleSheet, View } from 'react-native';

import { queryClient, releaseInactiveQueries } from '@/state/query-client';
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
import {
  createMaxedChunithmTestAccount,
  createChunithmTempAccount,
  createLocalMaimaiAccount,
  createMaxedMaimaiTestAccount,
  createMaxedMuseDashTestAccount,
  createMaxedPhigrosTestAccount,
  createTufBoundAccount,
  createMuseDashBoundAccount,
  createPhiraBoundAccount,
  LOCAL_MAIMAI_ACCOUNT_ID,
} from '@/domain/bound-account';
import { ChunithmTempAccountStore } from '@/storage/chunithm-temp-account-store';
import {
  ChunithmDemoAccountStore,
  DEFAULT_CHUNITHM_DEMO_PLAYER_NAME,
} from '@/storage/chunithm-demo-account-store';
import {
  DEFAULT_PHIGROS_DEMO_PLAYER_NAME,
  PhigrosDemoAccountStore,
} from '@/storage/phigros-demo-account-store';
import {
  DEFAULT_MUSEDASH_DEMO_PLAYER_NAME,
  MuseDashDemoAccountStore,
} from '@/storage/musedash-demo-account-store';
import { NotificationProvider } from '@/components/AppNotification';
import { songDetailScreenOptions } from '@/components/game-content/SongDetailScreenOptions';
import { AppThemeProvider, useAppTheme } from '@/theme/app-theme';
import { useThemeStore } from '@/state/theme-store';
import { ensureUiIconFontsLoaded } from '@/features/storage-management/ui-icon-fonts';
import { runStorageCacheMaintenance } from '@/features/storage-management/storage-cache-maintenance';
import { markRemoteImageCacheGameActive } from '@/services/remote-image-cache';
import { RemoteImageActivityScope } from '@/components/RemoteImage';
import { hydrateBoundAccountThumbnails } from '@/services/account-thumbnail';
import { hydrateLocalAccountRatings } from '@/services/hydrate-local-account-ratings';
import { startTimer } from '@/utils/startup-timing';
import { TufAccountStore } from '@/storage/tuf-account-store';
import { MuseDashAccountStore } from '@/storage/musedash-account-store';
import { PhiraAccountStore } from '@/storage/phira-account-store';
import {
  AppLifecycleProvider,
  getForegroundAbortSignal,
  useAppLifecycle,
} from '@/state/app-lifecycle';
import {
  initializeRuntimeDiagnostics,
  recordRuntimeDiagnostic,
} from '@/services/runtime-diagnostics';
import { uploadTaskController } from '@/services/upload-maimai-from-friend-code';

const sessions = new SecureSessionStore();
const localAccounts = new LocalAccountStore();
const demoAccounts = new DemoAccountStore();
const chunithmDemoAccount = new ChunithmDemoAccountStore();
const phigrosDemoAccount = new PhigrosDemoAccountStore();
const museDashDemoAccount = new MuseDashDemoAccountStore();
const chunithmTempAccount = new ChunithmTempAccountStore();
const tufAccounts = new TufAccountStore();
const museDashAccounts = new MuseDashAccountStore();
const phiraAccounts = new PhiraAccountStore();
const snapshots = new SqliteSnapshotRepository();

async function loadLocalBoundAccounts() {
  let stored = await localAccounts.load();
  // 已有默认本地玩家数据时迁移一次账号记录。
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
  // 首帧只建账号档案（rating 先为 0）；真实 Rating 由 hydrateLocalAccountRatings
  // 首帧后再读取完整成绩，避免启动时阻塞界面。
  return stored.map((profile) => createLocalMaimaiAccount(profile.displayName, 0, profile.id));
}

async function loadDemoBoundAccounts() {
  const stored = await demoAccounts.load();
  return stored.map((profile) => createMaxedMaimaiTestAccount(
    0,
    profile.displayName || DEFAULT_DEMO_PLAYER_NAME,
    profile.id,
  ));
}

async function loadChunithmDemoBoundAccount() {
  const stored = await chunithmDemoAccount.load();
  return stored
    ? createMaxedChunithmTestAccount(
        0,
        stored.displayName || DEFAULT_CHUNITHM_DEMO_PLAYER_NAME,
      )
    : null;
}

async function loadPhigrosDemoBoundAccount() {
  const stored = await phigrosDemoAccount.load();
  return stored
    ? createMaxedPhigrosTestAccount(
        0,
        stored.displayName || DEFAULT_PHIGROS_DEMO_PLAYER_NAME,
      )
    : null;
}

async function loadMuseDashDemoBoundAccount() {
  const stored = await museDashDemoAccount.load();
  return stored
    ? createMaxedMuseDashTestAccount(
        0,
        stored.displayName || DEFAULT_MUSEDASH_DEMO_PLAYER_NAME,
      )
    : null;
}

async function loadOptionalBoundAccounts() {
  const [locals, demos, chunithmDemo, phigrosDemo, museDashDemo, hasChunithmTemp, storedTufAccounts, storedMuseDashAccounts, storedPhiraAccounts] = await Promise.all([
    loadLocalBoundAccounts(),
    loadDemoBoundAccounts(),
    loadChunithmDemoBoundAccount(),
    loadPhigrosDemoBoundAccount(),
    loadMuseDashDemoBoundAccount(),
    chunithmTempAccount.load(),
    tufAccounts.load(),
    museDashAccounts.load(),
    phiraAccounts.load(),
  ]);
  return [
    ...locals,
    ...demos,
    ...(chunithmDemo ? [chunithmDemo] : []),
    ...(phigrosDemo ? [phigrosDemo] : []),
    ...(museDashDemo ? [museDashDemo] : []),
    ...(hasChunithmTemp ? [createChunithmTempAccount()] : []),
    ...storedTufAccounts.map((account) => createTufBoundAccount(account)),
    ...storedMuseDashAccounts.map((account) => createMuseDashBoundAccount(account)),
    ...storedPhiraAccounts.map((account) => createPhiraBoundAccount(account)),
  ];
}

export const unstable_settings = { anchor: '(tabs)' };
export default function RootLayout() {
  return <AppLifecycleProvider><RootLayoutContent /></AppLifecycleProvider>;
}

function RootLayoutContent() {
  const restoreStatus = useSession((state) => state.restoreStatus);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const themeHydrated = useThemeStore((state) => state.hydrated);
  const hydrateTheme = useThemeStore((state) => state.hydrate);
  const appearance = useThemeStore((state) => state.appearance);
  const lifecycle = useAppLifecycle();
  const [iconFontsReady, setIconFontsReady] = useState(false);
  const localHydrationGenerationRef = useRef(-1);
  const releasedMemoryWarningRef = useRef(0);
  const storageMaintenanceStartedRef = useRef(false);

  useEffect(() => {
    void initializeRuntimeDiagnostics();
  }, []);

  useEffect(() => {
    if (restoreStatus !== 'ready') return;
    const task = InteractionManager.runAfterInteractions(() => {
      void markRemoteImageCacheGameActive(activeGameId).catch(() => undefined);
    });
    return () => task.cancel();
  }, [activeAccountId, activeGameId, restoreStatus]);

  useEffect(() => {
    const sessionState = useSession.getState();
    void recordRuntimeDiagnostic('lifecycle', {
      lifecyclePhase: lifecycle.phase,
      gameType: sessionState.activeGameId,
      providerType: sessionState.activeProviderId ?? undefined,
      accountCount: sessionState.boundAccounts.length,
      queryCount: queryClient.getQueryCache().getAll().length,
    });
  }, [lifecycle.foregroundGeneration, lifecycle.phase]);

  useEffect(() => {
    if (lifecycle.memoryWarningGeneration === 0) return;
    void recordRuntimeDiagnostic('memory-warning', {
      lifecyclePhase: lifecycle.phase,
      queryCount: queryClient.getQueryCache().getAll().length,
      memoryWarning: true,
    });
  }, [lifecycle.memoryWarningGeneration, lifecycle.phase]);

  useEffect(() => {
    let cancelled = false;
    const stop = startTimer('root.iconFonts');
    void ensureUiIconFontsLoaded()
      .catch(() => undefined)
      .finally(() => {
        stop();
        if (!cancelled) setIconFontsReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (restoreStatus === 'restoring') {
      const stop = startTimer('root.restoreTotal');
      void restoreSession(() => sessions.loadVault(), loadOptionalBoundAccounts)
        .then(() => {
          stop();
        });
    }
  }, [restoreStatus]);

  useEffect(() => {
    focusManager.setFocused(lifecycle.foregroundReady);
    if (lifecycle.foregroundReady) uploadTaskController.resume();
    else if (lifecycle.phase === 'background') uploadTaskController.pause();
    if (lifecycle.phase === 'background') {
      void queryClient.cancelQueries();
    }
    if (lifecycle.memoryWarningGeneration > releasedMemoryWarningRef.current) {
      releasedMemoryWarningRef.current = lifecycle.memoryWarningGeneration;
      releaseInactiveQueries(queryClient);
      void ExpoImage.clearMemoryCache();
    }
  }, [lifecycle.foregroundReady, lifecycle.memoryWarningGeneration, lifecycle.phase]);

  useEffect(() => () => focusManager.setFocused(undefined), []);

  useEffect(() => {
    if (restoreStatus !== 'ready' || !lifecycle.foregroundReady) return;
    if (localHydrationGenerationRef.current === lifecycle.foregroundGeneration) return;
    localHydrationGenerationRef.current = lifecycle.foregroundGeneration;
    const signal = getForegroundAbortSignal();
    void hydrateLocalAccountRatings(undefined, signal).catch(() => undefined);
    void hydrateBoundAccountThumbnails(undefined, signal).catch(() => undefined);
  }, [lifecycle.foregroundGeneration, lifecycle.foregroundReady, restoreStatus]);

  useEffect(() => {
    const stop = startTimer('root.themeHydrate');
    void hydrateTheme().finally(stop);
  }, [hydrateTheme]);
  useEffect(() => { Appearance.setColorScheme(appearance === 'system' ? null : appearance); }, [appearance]);

  useEffect(() => {
    if (restoreStatus !== 'ready' || !themeHydrated || !iconFontsReady || !lifecycle.foregroundReady) return;
    if (storageMaintenanceStartedRef.current) return;
    const task = InteractionManager.runAfterInteractions(() => {
      if (storageMaintenanceStartedRef.current) return;
      storageMaintenanceStartedRef.current = true;
      void runStorageCacheMaintenance().catch(() => undefined);
    });
    return () => task.cancel();
  }, [restoreStatus, themeHydrated, iconFontsReady, lifecycle.foregroundReady]);

  if (restoreStatus === 'restoring' || !themeHydrated || !iconFontsReady) {
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
        <Stack.Screen name="best-image" options={{ title: '成绩图片' }} />
        <Stack.Screen name="songs/[songId]" options={songDetailScreenOptions()} />
        <Stack.Screen name="songs/chart-preview" options={{ title: '谱面确认' }} />
        <Stack.Screen name="songs/phigros-chart-preview" options={{ title: '谱面确认' }} />
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

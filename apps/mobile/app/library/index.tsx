import { isGameAvailable, usePluginRevision } from '@rranker/sdk';
import { useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable } from 'react-native';
import { useNotification } from '@rranker/sdk/components/AppNotification';
import { StackScreenActivityScope } from '@rranker/sdk/components/CachedTabScreen';
import { GamePageScreen } from '@/components/GamePageScreen';
import { pickUserDataBackup, shareUserDataBackup } from '@/services/user-data-file-service';
import { providerErrorToUserMessage } from '@rranker/sdk/providers/errors';
import type { UserDataBackup, RestoreMode } from '@rranker/sdk/domain/user-library';
import { useUserLibrary } from '@rranker/sdk/hooks/use-user-library';
import { useSession } from '@rranker/sdk/state/session-store';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';

export default function UserLibraryScreen() {
  return <StackScreenActivityScope><LibraryActions /><GamePageScreen page="library" /></StackScreenActivityScope>;
}

function LibraryActions() {
  usePluginRevision();
  const theme = useAppTheme();
  const library = useUserLibrary(false);
  const gameId = useSession(state => state.activeGameId);
  const enabled = isGameAvailable(gameId);
  const { showNotification, showActionNotification } = useNotification();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const unsubscribe = useSession.subscribe(state => {
      if (state.activeGameId !== gameId || !isGameAvailable(gameId)) request.current?.abort();
    });
    return () => { unsubscribe(); request.current?.abort(); };
  }, [gameId]);

  const run = async (operation: () => Promise<void>, signal: AbortSignal) => {
    if (running.current || signal.aborted) return;
    running.current = true;
    setBusy(true);
    try { await operation(); }
    catch (error) {
      if (!signal.aborted) showNotification({ title: '个人曲库操作失败',
        message: providerErrorToUserMessage(error, '请重试。'), variant: 'error' });
    } finally { running.current = false; setBusy(false); }
  };
  const restore = (backup: UserDataBackup, mode: RestoreMode, signal: AbortSignal) => run(async () => {
    if (useSession.getState().activeGameId !== gameId) return;
    await library.restoreBackup(gameId, backup, mode, signal);
    if (!signal.aborted) showNotification({ title: '当前游戏个人曲库已导入', variant: 'success' });
  }, signal);
  const importBackup = (signal: AbortSignal) => run(async () => {
    const backup = await pickUserDataBackup(gameId);
    if (!backup || signal.aborted || useSession.getState().activeGameId !== gameId) return;
    showActionNotification({ title: '导入当前游戏个人曲库',
      message: `备份包含 ${backup.items.length} 条记录。合并保留当前游戏已有内容，替换覆盖当前游戏的收藏、练习、标签和标签预设。`,
      actions: [
        { label: '取消', tone: 'cancel' },
        { label: '合并', onPress: () => restore(backup, 'merge', signal) },
        { label: '替换', tone: 'destructive', onPress: () => restore(backup, 'replace', signal) },
      ],
    });
  }, signal);
  const openMenu = () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    showActionNotification({ title: '当前游戏个人曲库', actions: [
      { label: '导入', onPress: () => importBackup(controller.signal) },
      { label: '导出', onPress: () => run(async () => {
        const backup = await library.createBackup(gameId);
        if (!controller.signal.aborted) await shareUserDataBackup(backup);
      }, controller.signal) },
      { label: '取消', tone: 'cancel' },
    ] });
  };
  if (!enabled) return null;
  return <Stack.Screen options={{ headerRight: () => <Pressable testID="library-menu" disabled={busy}
    onPress={openMenu} hitSlop={8} style={{ padding: 8 }}>
    {busy ? <ActivityIndicator color={theme.accent} /> : <Ionicons name="ellipsis-horizontal" size={22} color={theme.text} />}
  </Pressable> }} />;
}

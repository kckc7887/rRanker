import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useNotification } from '@/components/AppNotification';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { clearStorageByCategories } from '@/features/storage-management/clear-storage-cache';
import { formatStorageBytes } from '@/features/storage-management/fs-storage';
import { listClearableCategoryIds } from '@/features/storage-management/storage-usage';
import { useAppTheme } from '@/theme/app-theme';
import { storageClearPreferencesStore } from '@/storage/storage-clear-prefs-store';
import { providerErrorToUserMessage } from '@/providers/errors';
import { useUserLibrary } from '@/hooks/use-user-library';
import { pickUserDataBackup, shareUserDataBackup } from '@/services/user-data-file-service';
import type { RestoreMode, UserDataBackup } from '@/domain/user-library';

export default function SettingsTabScreen() {
  return <CachedTabScreen><SettingsScreen /></CachedTabScreen>;
}

export function SettingsScreen() {
  const tabBottomInset = useNativeTabBottomInset();
  const theme = useAppTheme();
  const { showNotification, showActionNotification } = useNotification();
  const [quickClearing, setQuickClearing] = useState(false);
  const library = useUserLibrary(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const backupRunning = useRef(false);

  const runBackup = async <T,>(run: () => Promise<T>): Promise<T | undefined> => {
    if (backupRunning.current) return;
    backupRunning.current = true;
    setBackupBusy(true);
    try { return await run(); }
    catch (error) {
      showNotification({ title: '个人曲库操作失败', message: providerErrorToUserMessage(error, '请重试。'), variant: 'error' });
    } finally { backupRunning.current = false; setBackupBusy(false); }
  };

  const restore = (backup: UserDataBackup, mode: RestoreMode) => runBackup(async () => {
    await library.restoreBackup(backup, mode);
    showNotification({ title: '个人曲库已导入', variant: 'success' });
  });

  const importBackup = async () => {
    const backup = await runBackup(pickUserDataBackup);
    if (!backup) return;
    showActionNotification({
      title: '导入个人曲库',
      message: `备份包含 ${backup.items.length} 条收藏、练习或标签记录。合并会保留现有内容，替换会用备份覆盖个人曲库。`,
      actions: [
        { label: '取消', tone: 'cancel' },
        { label: '合并', onPress: () => restore(backup, 'merge') },
        { label: '替换', tone: 'destructive', onPress: () => restore(backup, 'replace') },
      ],
    });
  };

  const handleQuickClear = async () => {
    if (quickClearing) return;
    setQuickClearing(true);
    try {
      const allowed = listClearableCategoryIds();
      const prefs = await storageClearPreferencesStore.load(allowed);
      if (prefs.selectedIds.length === 0) {
        showNotification({
          title: '未选择缓存',
          message: '请先进入存储管理勾选要清除的种类。',
          variant: 'warning',
        });
        return;
      }
      const result = await clearStorageByCategories(prefs.selectedIds);
      if (result.failures.length > 0) {
        const reclaimed = result.reclaimedBytes === null
          ? ''
          : `，已释放 ${formatStorageBytes(result.reclaimedBytes)}`;
        showNotification({
          title: '部分清除失败',
          message: `已清除 ${result.clearedIds.length} 项${reclaimed}，部分项目未能清除，请重试。`,
          variant: 'warning',
        });
      } else {
        const reclaimed = result.reclaimedBytes === null
          ? ''
          : `，已释放 ${formatStorageBytes(result.reclaimedBytes)}`;
        showNotification({
          title: '清除完成',
          message: `已清除 ${result.clearedIds.length} 类缓存${reclaimed}。`,
          variant: 'success',
        });
      }
    } catch (error) {
      showNotification({
        title: '清除失败',
        message: providerErrorToUserMessage(error, '无法清除缓存，请稍后重试。'),
        variant: 'error',
      });
    } finally {
      setQuickClearing(false);
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={[styles.page, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: tabBottomInset + 16 }]}
      scrollIndicatorInsets={{ bottom: tabBottomInset }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/personalization' as Href)}
        style={[styles.row, { backgroundColor: theme.surface }]}
      >
        <View style={styles.rowText}>
          <Text style={[styles.title, { color: theme.text }]}>个性化</Text>
          <Text style={[styles.detail, { color: theme.textMuted }]}>外观、主题色与成绩卡片样式</Text>
        </View>
        <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/game-management' as Href)}
        style={[styles.row, { backgroundColor: theme.surface }]}
      >
        <View style={styles.rowText}>
          <Text style={[styles.title, { color: theme.text }]}>游戏管理</Text>
          <Text style={[styles.detail, { color: theme.textMuted }]}>绑定的游戏账号与数据源</Text>
        </View>
        <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
      </Pressable>
      <View style={[styles.row, { backgroundColor: theme.surface }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="存储管理"
          onPress={() => router.push('/storage-management' as Href)}
          style={styles.rowMain}
        >
          <View style={styles.rowText}>
            <Text style={[styles.title, { color: theme.text }]}>存储管理</Text>
            <Text style={[styles.detail, { color: theme.textMuted }]}>查看占用并清理缓存</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="快捷清除缓存"
          hitSlop={8}
          disabled={quickClearing}
          onPress={() => void handleQuickClear()}
          style={[styles.quickClear, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]}
        >
          {quickClearing
            ? <ActivityIndicator color={theme.accent} size="small" />
            : <Ionicons name="trash-outline" size={18} color={theme.accent} />}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="打开存储管理"
          onPress={() => router.push('/storage-management' as Href)}
          hitSlop={8}
        >
          <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
        </Pressable>
      </View>
      <View style={[styles.row, { backgroundColor: theme.surface }]}>
        <View style={styles.rowText}>
          <Text style={[styles.title, { color: theme.text }]}>个人曲库</Text>
          <Text style={[styles.detail, { color: theme.textMuted }]}>备份收藏、练习清单和标签</Text>
        </View>
        <Pressable disabled={backupBusy} onPress={() => void importBackup()} style={styles.backupAction}>
          <Text style={{ color: theme.accent }}>导入</Text>
        </Pressable>
        <Pressable disabled={backupBusy} onPress={() => void runBackup(async () => {
          await shareUserDataBackup(await library.createBackup());
        })} style={styles.backupAction}>
          <Text style={{ color: theme.accent }}>导出</Text>
        </Pressable>
        {backupBusy ? <ActivityIndicator color={theme.accent} /> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="调试"
        onPress={() => router.push('/debug' as Href)}
        style={[styles.row, { backgroundColor: theme.surface }]}
      >
        <View style={styles.rowText}>
          <Text style={[styles.title, { color: theme.text }]}>调试</Text>
          <Text style={[styles.detail, { color: theme.textMuted }]}>测试账号与问题排查</Text>
        </View>
        <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
      </Pressable>
      <Pressable
        onPress={() => router.push('/about' as Href)}
        style={[styles.row, { backgroundColor: theme.surface }]}
      >
        <View style={styles.rowText}>
          <Text style={[styles.title, { color: theme.text }]}>关于</Text>
          <Text style={[styles.detail, { color: theme.textMuted }]}>隐私政策</Text>
        </View>
        <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12 },
  row: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: { flex: 1, gap: 4 },
  rowMain: { flex: 1 },
  backupAction: { paddingVertical: 8, paddingHorizontal: 4 },
  title: { color: '#111827', fontSize: 17, fontWeight: '700' },
  detail: { color: '#6B7280', fontSize: 13 },
  chevron: { color: '#9CA3AF', fontSize: 28, lineHeight: 28, fontWeight: '300' },
  quickClear: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { DetailGestureRoot } from '@/components/game-content/DetailPressable';
import { SettingsRow } from '@/components/SettingsRow';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
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
    <DetailGestureRoot style={styles.page}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={[styles.page, { backgroundColor: theme.background }]}
        contentContainerStyle={[styles.content, { paddingBottom: tabBottomInset + 16 }]}
        scrollIndicatorInsets={{ bottom: tabBottomInset }}
      >
        <SettingsRow title="个性化" detail="外观、主题色与成绩卡片样式" onPress={() => router.push('/personalization' as Href)} />
        <SettingsRow title="游戏管理" detail="绑定的游戏账号与数据源" onPress={() => router.push('/game-management' as Href)} />
        <SettingsRow title="存储管理" detail="查看占用并清理缓存" onPress={() => router.push('/storage-management' as Href)}>
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
        </SettingsRow>
        <SettingsRow title="个人曲库" detail="备份收藏、练习清单和标签">
          <Pressable disabled={backupBusy} onPress={() => void importBackup()} style={styles.backupAction}>
            <Text style={{ color: theme.accent }}>导入</Text>
          </Pressable>
          <Pressable disabled={backupBusy} onPress={() => void runBackup(async () => {
            await shareUserDataBackup(await library.createBackup());
          })} style={styles.backupAction}>
            <Text style={{ color: theme.accent }}>导出</Text>
          </Pressable>
          {backupBusy ? <ActivityIndicator color={theme.accent} /> : null}
        </SettingsRow>
        <SettingsRow title="调试" detail="测试账号与问题排查" onPress={() => router.push('/debug' as Href)} />
        <SettingsRow title="关于" detail="隐私政策" onPress={() => router.push('/about' as Href)} />
      </ScrollView>
    </DetailGestureRoot>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12 },
  backupAction: { paddingVertical: 8, paddingHorizontal: 4 },
  quickClear: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

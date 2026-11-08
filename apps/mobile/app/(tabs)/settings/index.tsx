import { DetailGestureRoot } from '@rranker/sdk/components/game-content/DetailPressable';
import { SettingsRow } from '@rranker/sdk/components/SettingsRow';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useNotification } from '@rranker/sdk/components/AppNotification';
import { CachedTabScreen } from '@rranker/sdk/components/CachedTabScreen';
import { useNativeTabBottomInset } from '@rranker/sdk/hooks/use-native-tab-bottom-inset';
import { clearStorageByCategories } from '@rranker/sdk/features/storage-management/clear-storage-cache';
import { formatStorageBytes } from '@rranker/sdk/features/storage-management/fs-storage';
import { listClearableCategoryIds } from '@rranker/sdk/features/storage-management/storage-usage';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';
import { storageClearPreferencesStore } from '@rranker/sdk/storage/storage-clear-prefs-store';
import { providerErrorToUserMessage } from '@rranker/sdk/providers/errors';

export default function SettingsTabScreen() {
  return <CachedTabScreen><SettingsScreen /></CachedTabScreen>;
}

export function SettingsScreen() {
  const tabBottomInset = useNativeTabBottomInset();
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const [quickClearing, setQuickClearing] = useState(false);
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
        <SettingsRow title="插件管理" detail="游戏适配器、数据源与工具" onPress={() => router.push('/plugin-management' as Href)} />
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
        <SettingsRow title="调试" detail="测试账号与问题排查" onPress={() => router.push('/debug' as Href)} />
        <SettingsRow title="关于" detail="隐私政策" onPress={() => router.push('/about' as Href)} />
      </ScrollView>
    </DetailGestureRoot>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12 },
  quickClear: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { AccentColorPicker } from '@/components/AccentColorPicker';
import { useNotification } from '@/components/AppNotification';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { clearStorageByCategories } from '@/features/storage-management/clear-storage-cache';
import { formatStorageBytes } from '@/features/storage-management/fs-storage';
import {
  collectStorageUsage,
  listClearableCategoryIds,
} from '@/features/storage-management/storage-usage';
import {
  BADGE_LAYER_OVERLAY,
  BADGE_RAINBOW_BORDER_COLORS,
  BADGE_RAINBOW_FILL_COLORS,
  BEST_IMAGE_RAINBOW_TEXT,
} from '@/features/best-image/best-image-badge-theme';
import { APP_ACCENTS, useAppTheme } from '@/theme/app-theme';
import { useThemeStore } from '@/state/theme-store';
import type { AppAppearance } from '@/storage/theme-preferences-store';
import { storageClearPreferencesStore } from '@/storage/storage-clear-prefs-store';

const APPEARANCES: { id: AppAppearance; label: string }[] = [
  { id: 'system', label: '跟随系统' }, { id: 'light', label: '浅色' }, { id: 'dark', label: '深色' },
];

export default function SettingsScreen() {
  const tabBottomInset = useNativeTabBottomInset();
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const appearance = useThemeStore((state) => state.appearance);
  const accent = useThemeStore((state) => state.accent);
  const customHex = useThemeStore((state) => state.customHex);
  const setAppearance = useThemeStore((state) => state.setAppearance);
  const setAccent = useThemeStore((state) => state.setAccent);
  const setCustomAccent = useThemeStore((state) => state.setCustomAccent);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [storageLabel, setStorageLabel] = useState('统计各类缓存占用');
  const [quickClearing, setQuickClearing] = useState(false);

  const refreshStorageLabel = useCallback(async () => {
    try {
      const usage = await collectStorageUsage();
      setStorageLabel(`已用 ${formatStorageBytes(usage.totalBytes)}`);
    } catch {
      setStorageLabel('统计各类缓存占用');
    }
  }, []);

  useEffect(() => {
    void refreshStorageLabel();
  }, [refreshStorageLabel]);

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
      await refreshStorageLabel();
      if (result.failures.length > 0) {
        showNotification({
          title: '部分清除失败',
          message: `已清除 ${result.clearedIds.length} 项；失败：${result.failures.join('、')}`,
          variant: 'warning',
        });
      } else {
        showNotification({
          title: '清除完成',
          message: `已按勾选清除 ${result.clearedIds.length} 类缓存。`,
          variant: 'success',
        });
      }
    } catch (error) {
      showNotification({
        title: '清除失败',
        message: error instanceof Error ? error.message : '无法清除缓存',
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
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>外观</Text>
        <View style={styles.options}>
          {APPEARANCES.map((option) => <Pressable key={option.id} accessibilityRole="button"
            accessibilityLabel={`外观 ${option.label}`} accessibilityState={{ selected: appearance === option.id }}
            onPress={() => void setAppearance(option.id)}
            style={[styles.option, { borderColor: theme.border }, appearance === option.id && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
            <Text style={{ color: appearance === option.id ? '#FFF' : theme.textSecondary, fontWeight: '700' }}>{option.label}</Text>
          </Pressable>)}
        </View>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>主题色</Text>
        <View style={styles.swatches}>
          {APP_ACCENTS.map((option) => <Pressable key={option.id} accessibilityRole="button"
            accessibilityLabel={`主题色 ${option.label}`} accessibilityState={{ selected: accent === option.id }}
            onPress={() => void setAccent(option.id)} style={[styles.swatchFrame, accent === option.id && { borderColor: theme.text }]}>
            <View style={[styles.swatch, { backgroundColor: option.color }]} />
          </Pressable>)}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="主题色 自定义"
            accessibilityState={{ selected: accent === 'custom' }}
            onPress={() => setPickerOpen(true)}
            style={[styles.swatchFrame, accent === 'custom' && { borderColor: theme.text }]}
          >
            {accent === 'custom'
              ? <View style={[styles.swatch, { backgroundColor: customHex }]} />
              : (
                <LinearGradient
                  colors={BADGE_RAINBOW_BORDER_COLORS}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.customRainbowBorder}
                >
                  <LinearGradient
                    colors={BADGE_RAINBOW_FILL_COLORS}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.customRainbowFill}
                  >
                    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.customRainbowOverlay]} />
                    <Text style={styles.customMark}>+</Text>
                  </LinearGradient>
                </LinearGradient>
              )}
          </Pressable>
        </View>
      </View>
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
            <Text style={[styles.detail, { color: theme.textMuted }]}>{storageLabel}</Text>
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
      <AccentColorPicker
        visible={pickerOpen}
        initialHex={accent === 'custom' ? customHex : theme.accent}
        onClose={() => setPickerOpen(false)}
        onApply={(hex) => {
          void setCustomAccent(hex);
          setPickerOpen(false);
        }}
      />
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
  section: { borderRadius: 14, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  options: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, minHeight: 38, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatchFrame: { width: 38, height: 38, borderWidth: 2, borderColor: 'transparent', borderRadius: 19, padding: 3 },
  swatch: { flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  customRainbowBorder: { flex: 1, borderRadius: 16, padding: 2, overflow: 'hidden' },
  customRainbowFill: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  customRainbowOverlay: { backgroundColor: BADGE_LAYER_OVERLAY },
  customMark: { color: BEST_IMAGE_RAINBOW_TEXT, fontSize: 16, fontWeight: '800' },
});

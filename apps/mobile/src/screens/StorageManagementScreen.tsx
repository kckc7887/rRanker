import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StorageDonutChart } from '@/components/StorageDonutChart';
import { useNotification } from '@/components/AppNotification';
import { clearStorageByCategories } from '@/features/storage-management/clear-storage-cache';
import { formatStorageBytes } from '@/features/storage-management/fs-storage';
import {
  collectStorageUsage,
  listClearableCategoryIds,
  type StorageUsageReport,
} from '@/features/storage-management/storage-usage';
import {
  storageClearPreferencesStore,
  type StorageClearCategoryId,
} from '@/storage/storage-clear-prefs-store';
import { providerErrorToUserMessage } from '@/providers/errors';
import { useAppTheme } from '@/theme/app-theme';

export function StorageManagementScreen() {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const [report, setReport] = useState<StorageUsageReport | null>(null);
  const [selectedIds, setSelectedIds] = useState<StorageClearCategoryId[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const allowed = listClearableCategoryIds();
      const [usage, prefs] = await Promise.all([
        collectStorageUsage(),
        storageClearPreferencesStore.load(allowed),
      ]);
      setReport(usage);
      setSelectedIds(prefs.selectedIds);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleId = async (id: StorageClearCategoryId) => {
    const allowed = listClearableCategoryIds();
    const next = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    setSelectedIds(next);
    await storageClearPreferencesStore.save({ version: 1, selectedIds: next.filter((item) => allowed.includes(item)) });
  };

  const handleClear = async () => {
    if (selectedIds.length === 0) {
      showNotification({ title: '未选择缓存', message: '请先勾选要清除的种类。', variant: 'warning' });
      return;
    }
    setClearing(true);
    try {
      const result = await clearStorageByCategories(selectedIds);
      await refresh();
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
      setClearing(false);
    }
  };

  const clearableSegments = report?.segments.filter((segment) => segment.clearable) ?? [];

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <View style={styles.summaryRow}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>可清理约</Text>
          <Text style={[styles.summaryBytes, { color: theme.accent }]}>{formatStorageBytes(report?.clearableBytes ?? 0)}</Text>
        </View>
        {loading && !report ? (
          <ActivityIndicator color={theme.accent} style={styles.chartLoading} />
        ) : (
          <StorageDonutChart
            segments={report?.segments ?? []}
            totalBytes={report?.totalBytes ?? 0}
          />
        )}
        <View style={styles.legend}>
          {(report?.segments ?? []).map((segment) => (
            <View key={segment.id} style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: segment.color }]} />
              <View style={styles.legendText}>
                <Text style={[styles.legendTitle, { color: theme.text }]}>{segment.title}</Text>
              </View>
              <Text style={[styles.legendBytes, { color: theme.textSecondary }]}>
                {formatStorageBytes(segment.bytes)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>清除缓存</Text>
        {clearableSegments.map((segment) => {
          const id = segment.clearCategoryId!;
          const selected = selectedIds.includes(id);
          return (
            <Pressable
              key={segment.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${segment.title}缓存`}
              onPress={() => void toggleId(id)}
              style={[styles.checkRow, { borderColor: theme.border }]}
            >
              <Ionicons
                name={selected ? 'checkbox' : 'square-outline'}
                size={22}
                color={selected ? theme.accent : theme.textMuted}
              />
              <View style={styles.checkText}>
                <Text style={[styles.checkTitle, { color: theme.text }]}>{segment.title}</Text>
                <Text style={[styles.checkDetail, { color: theme.textMuted }]}>
                  约 {formatStorageBytes(segment.bytes)}
                </Text>
              </View>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="清除缓存"
          disabled={clearing || loading}
          onPress={() => void handleClear()}
          style={[
            styles.clearButton,
            { backgroundColor: theme.accent },
            (clearing || loading) && styles.clearButtonDisabled,
          ]}
        >
          {clearing ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.clearButtonText}>清除缓存</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  card: { borderRadius: 14, padding: 16, gap: 14 },
  chartLoading: { height: 200, justifyContent: 'center' },
  legend: { gap: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { flex: 1, gap: 2 },
  legendTitle: { fontSize: 15, fontWeight: '700' },
  legendBytes: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  summaryBytes: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkText: { flex: 1, gap: 2 },
  checkTitle: { fontSize: 15, fontWeight: '700' },
  checkDetail: { fontSize: 12 },
  clearButton: {
    marginTop: 4,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonDisabled: { opacity: 0.55 },
  clearButtonText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});

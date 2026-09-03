import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
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
  type StorageUsageGroup,
  type StorageUsageReport,
} from '@/features/storage-management/storage-usage';
import {
  storageClearPreferencesStore,
  type StorageClearCategoryId,
} from '@/storage/storage-clear-prefs-store';
import { providerErrorToUserMessage } from '@/providers/errors';
import { useAppTheme } from '@/theme/app-theme';

type ExpandedGroups = Record<StorageUsageGroup['id'], boolean>;

type StorageScreenData = {
  report: StorageUsageReport;
  selectedIds: StorageClearCategoryId[];
};

let lastStorageReport: StorageUsageReport | null = null;
let storageScreenDataPromise: Promise<StorageScreenData> | null = null;

export function resetStorageManagementScreenCacheForTests(): void {
  lastStorageReport = null;
  storageScreenDataPromise = null;
}

function requestStorageScreenData(): Promise<StorageScreenData> {
  if (storageScreenDataPromise) return storageScreenDataPromise;
  const allowed = listClearableCategoryIds();
  storageScreenDataPromise = Promise.all([
    collectStorageUsage(),
    storageClearPreferencesStore.load(allowed),
  ]).then(([report, prefs]) => {
    lastStorageReport = report;
    return { report, selectedIds: prefs.selectedIds };
  }).finally(() => {
    storageScreenDataPromise = null;
  });
  return storageScreenDataPromise;
}

export function StorageManagementScreen() {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const mountedRef = useRef(true);
  const [report, setReport] = useState<StorageUsageReport | null>(lastStorageReport);
  const [selectedIds, setSelectedIds] = useState<StorageClearCategoryId[]>([]);
  const [expanded, setExpanded] = useState<ExpandedGroups>({ basic: false, cache: false });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true);
      setLoadFailed(false);
    }
    try {
      const data = await requestStorageScreenData();
      if (!mountedRef.current) return;
      setReport(data.report);
      setSelectedIds(data.selectedIds);
    } catch {
      if (mountedRef.current) setLoadFailed(true);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const task = InteractionManager.runAfterInteractions(() => {
      void refresh();
    });
    return () => {
      mountedRef.current = false;
      task.cancel();
    };
  }, [refresh]);

  const saveSelectedIds = useCallback(async (next: StorageClearCategoryId[]) => {
    const allowed = listClearableCategoryIds();
    const filtered = next.filter((item) => allowed.includes(item));
    setSelectedIds(filtered);
    await storageClearPreferencesStore.save({ version: 1, selectedIds: filtered });
  }, []);

  const toggleId = (id: StorageClearCategoryId) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    void saveSelectedIds(next);
  };

  const cacheGroup = report?.groups.find((group) => group.id === 'cache');
  const clearableItems = useMemo(
    () => cacheGroup?.items.filter((item) => item.clearable && item.clearCategoryId !== null) ?? [],
    [cacheGroup],
  );
  const allSelected = clearableItems.length > 0
    && clearableItems.every((item) => selectedIds.includes(item.clearCategoryId!));
  const selectedBytes = clearableItems.reduce(
    (sum, item) => sum + (selectedIds.includes(item.clearCategoryId!) ? item.clearableBytes : 0),
    0,
  );

  const handleClear = async () => {
    if (selectedIds.length === 0) {
      showNotification({ title: '未选择缓存', message: '请先勾选要清除的种类。', variant: 'warning' });
      return;
    }
    setClearing(true);
    try {
      const result = await clearStorageByCategories(selectedIds);
      await refresh();
      const reclaimed = result.reclaimedBytes === null
        ? ''
        : `，已释放 ${formatStorageBytes(result.reclaimedBytes)}`;
      if (result.failures.length > 0) {
        showNotification({
          title: '部分清除失败',
          message: `已清除 ${result.clearedIds.length} 项${reclaimed}，部分项目未能清除，请重试。`,
          variant: 'warning',
        });
      } else {
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
      if (mountedRef.current) setClearing(false);
    }
  };

  const toggleGroup = (id: StorageUsageGroup['id']) => {
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  };

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCopy}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>可清理约</Text>
            <Text style={[styles.summaryBytes, { color: theme.accent }]}>
              {formatStorageBytes(report?.clearableBytes ?? 0)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重新统计存储占用"
            disabled={loading}
            onPress={() => void refresh()}
            style={[styles.refreshButton, { borderColor: theme.border }]}
          >
            {loading && report
              ? <ActivityIndicator color={theme.accent} size="small" />
              : <Ionicons name="refresh" size={18} color={theme.accent} />}
          </Pressable>
        </View>

        {loading && !report ? (
          <ActivityIndicator color={theme.accent} style={styles.chartLoading} />
        ) : loadFailed && !report ? (
          <View style={styles.loadError}>
            <Text style={[styles.loadErrorTitle, { color: theme.text }]}>暂时无法统计占用</Text>
            <Text style={[styles.loadErrorDetail, { color: theme.textMuted }]}>请稍后重试。</Text>
            <Pressable accessibilityRole="button" onPress={() => void refresh()}>
              <Text style={[styles.retryText, { color: theme.accent }]}>重新统计</Text>
            </Pressable>
          </View>
        ) : report?.totalBytes === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.loadErrorTitle, { color: theme.text }]}>暂无可显示的存储数据</Text>
          </View>
        ) : (
          <StorageDonutChart
            segments={report?.groups ?? []}
            totalBytes={report?.totalBytes ?? 0}
          />
        )}

        {report?.groups.map((group) => (
          <View key={group.id} style={[styles.group, { borderColor: theme.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${group.title}，${formatStorageBytes(group.bytes)}`}
              accessibilityState={{ expanded: expanded[group.id] }}
              onPress={() => toggleGroup(group.id)}
              style={styles.groupHeader}
            >
              <View style={[styles.dot, { backgroundColor: group.color }]} />
              <View style={styles.groupCopy}>
                <Text style={[styles.groupTitle, { color: theme.text }]}>{group.title}</Text>
                {group.id === 'cache' ? (
                  <Text style={[styles.groupDetail, { color: theme.textMuted }]}>
                    可清理约 {formatStorageBytes(report.clearableBytes)}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.groupBytes, { color: theme.textSecondary }]}>{formatStorageBytes(group.bytes)}</Text>
              <Ionicons
                name={expanded[group.id] ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.textMuted}
              />
            </Pressable>

            {expanded[group.id] ? (
              <View style={[styles.groupBody, { borderTopColor: theme.border }]}>
                {group.id === 'cache' ? (
                  <View style={styles.bulkActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void saveSelectedIds(clearableItems.map((item) => item.clearCategoryId!))}
                    >
                      <Text style={[styles.bulkActionText, { color: theme.accent }]}>全选</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => void saveSelectedIds([])}>
                      <Text style={[styles.bulkActionText, { color: theme.accent }]}>取消全选</Text>
                    </Pressable>
                    <Text style={[styles.selectionState, { color: theme.textMuted }]}>
                      {allSelected ? '已全选' : `已选 ${selectedIds.length} 项`}
                    </Text>
                  </View>
                ) : null}

                {group.items.map((item) => {
                  const id = item.clearCategoryId;
                  const selected = id !== null && selectedIds.includes(id);
                  const content = (
                    <>
                      {item.clearable ? (
                        <Ionicons
                          name={selected ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={selected ? theme.accent : theme.textMuted}
                        />
                      ) : null}
                      <Text style={[styles.itemTitle, { color: theme.text }]}>{item.title}</Text>
                      <Text style={[styles.itemBytes, { color: theme.textSecondary }]}>{formatStorageBytes(item.bytes)}</Text>
                    </>
                  );
                  return item.clearable && id !== null ? (
                    <Pressable
                      key={item.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`${item.title}缓存`}
                      onPress={() => toggleId(id)}
                      style={styles.itemRow}
                    >
                      {content}
                    </Pressable>
                  ) : (
                    <View key={item.id} style={styles.itemRow}>{content}</View>
                  );
                })}

                {group.id === 'cache' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="清除已选缓存"
                    disabled={clearing || loading || selectedIds.length === 0}
                    onPress={() => void handleClear()}
                    style={[
                      styles.clearButton,
                      { backgroundColor: theme.accent },
                      (clearing || loading || selectedIds.length === 0) && styles.clearButtonDisabled,
                    ]}
                  >
                    {clearing ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.clearButtonText}>清除已选缓存 · 约 {formatStorageBytes(selectedBytes)}</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        ))}

        {loadFailed && report ? (
          <Text style={[styles.inlineWarning, { color: theme.danger }]}>统计没有更新，请稍后重试。</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  card: { borderRadius: 14, padding: 16, gap: 14 },
  chartLoading: { height: 200, justifyContent: 'center' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryCopy: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  summaryBytes: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  refreshButton: { width: 36, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  loadError: { height: 200, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyState: { height: 200, alignItems: 'center', justifyContent: 'center' },
  loadErrorTitle: { fontSize: 16, fontWeight: '800' },
  loadErrorDetail: { fontSize: 13 },
  retryText: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  groupHeader: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  groupCopy: { flex: 1, gap: 2 },
  groupTitle: { fontSize: 15, fontWeight: '800' },
  groupDetail: { fontSize: 12 },
  groupBytes: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  groupBody: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingBottom: 14 },
  bulkActions: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 16 },
  bulkActionText: { fontSize: 13, fontWeight: '700' },
  selectionState: { marginLeft: 'auto', fontSize: 12 },
  itemRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  itemBytes: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  clearButton: { marginTop: 10, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  clearButtonDisabled: { opacity: 0.55 },
  clearButtonText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  inlineWarning: { fontSize: 12, textAlign: 'center' },
});

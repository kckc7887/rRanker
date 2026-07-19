import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

export interface QueryStateViewProps<T> {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  error?: unknown;
  emptyText?: string;
  onRetry?: () => void;
  data: T | undefined;
  renderData: (data: T) => ReactElement;
}

export function QueryStateView<T,>({
  isLoading,
  isError,
  isEmpty,
  data,
  emptyText,
  onRetry,
  renderData,
}: QueryStateViewProps<T>) {
  const theme = useAppTheme();
  if (isLoading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View style={styles.center}>
        <Text style={[styles.statusText, { color: theme.textMuted }]}>加载失败，请重试</Text>
        {onRetry ? (
          <Pressable style={[styles.retryButton, { backgroundColor: theme.accent }]} onPress={onRetry}>
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (isEmpty && !data) {
    return (
      <View style={styles.center}>
        <Text style={[styles.statusText, { color: theme.textMuted }]}>{emptyText ?? '暂无数据'}</Text>
      </View>
    );
  }

  if (data) {
    return renderData(data);
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusText: { color: '#6B7280', fontSize: 14, marginBottom: 12 },
  retryButton: {
    backgroundColor: '#246BFD',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});

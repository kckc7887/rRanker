import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { Card } from '@/components/Card';
import { SourceStatus } from '@/components/SourceStatus';
import type { RandomChartsCount } from '@/domain/random-charts';
import type { SourceStatusItem } from '@/domain/models';
import { useAppTheme } from '@/theme/app-theme';

const COUNTS: readonly RandomChartsCount[] = [1, 2, 3, 4];

export type RandomChartsPageProps = {
  count: RandomChartsCount;
  onCountChange: (count: RandomChartsCount) => void;
  filter: ReactNode;
  sourceItems: readonly SourceStatusItem[];
  poolSize: number;
  onDraw: () => void;
  hasDrawn: boolean;
  resultCount: number;
  results: ReactNode;
  emptyMessage: string;
  drawDisabled?: boolean;
  poolStatus?: string;
  poolError?: string | null;
  onRetryPool?: () => void;
};

function CountChip({
  value,
  active,
  onPress,
}: {
  value: RandomChartsCount;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={`抽取 ${value} 首`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
        active && { backgroundColor: theme.accent, borderColor: theme.accent },
      ]}
    >
      <Text style={[
        styles.chipText,
        { color: theme.textSecondary },
        active && styles.chipTextActive,
      ]}>
        {value}
      </Text>
    </Pressable>
  );
}

export function RandomChartsPage({
  count,
  onCountChange,
  filter,
  sourceItems,
  poolSize,
  onDraw,
  hasDrawn,
  resultCount,
  results,
  emptyMessage,
  drawDisabled = false,
  poolStatus,
  poolError,
  onRetryPool,
}: RandomChartsPageProps) {
  const theme = useAppTheme();
  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: '随机歌曲' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        testID="random-charts-scroll"
      >
        <SourceStatus items={[...sourceItems]} />
        <Card>
          <Text style={[styles.heading, { color: theme.text }]}>抽取数量</Text>
          <View style={styles.chipRow}>
            {COUNTS.map((value) => (
              <CountChip
                active={count === value}
                key={value}
                onPress={() => onCountChange(value)}
                value={value}
              />
            ))}
          </View>
        </Card>

        <View
          style={[styles.filterContainer, { borderColor: theme.border }]}
          testID="random-charts-filter"
        >
          {filter}
        </View>

        <Card>
          <Text style={[styles.poolHint, { color: theme.textMuted }]}>
            {poolStatus ?? `候选谱面 ${poolSize} 条`}
          </Text>
          {poolError ? <View style={styles.poolErrorRow}>
            <Text accessibilityRole="alert" style={[styles.poolErrorText, { color: theme.danger }]}>{poolError}</Text>
            {onRetryPool ? <Pressable accessibilityLabel="重试加载随机池" accessibilityRole="button"
              onPress={onRetryPool} style={[styles.retryButton, { borderColor: theme.accent }]}>
              <Text style={[styles.retryButtonText, { color: theme.accent }]}>重试</Text>
            </Pressable> : null}
          </View> : null}
          <Pressable
            accessibilityLabel={hasDrawn ? '再抽一次' : '抽取'}
            accessibilityRole="button"
            accessibilityState={{ disabled: drawDisabled }}
            disabled={drawDisabled}
            onPress={onDraw}
            style={[styles.drawButton, { backgroundColor: theme.accent }, drawDisabled && styles.disabled]}
            testID="random-charts-draw"
          >
            <Text style={styles.drawButtonText}>
              {hasDrawn ? '再抽一次' : '抽取'}
            </Text>
          </Pressable>
        </Card>

        {hasDrawn ? (
          <View style={styles.resultSection} testID="random-charts-results">
            <Text style={[styles.heading, { color: theme.text }]}>抽取结果</Text>
            {resultCount === 0 ? (
              <Card>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                  {emptyMessage}
                </Text>
              </Card>
            ) : (
              <View style={styles.resultList}>
                {results}
                {resultCount < count && poolSize > 0 ? (
                  <Text style={[styles.hint, { color: theme.textMuted }]}>
                    候选不足 {count} 条，已返回全部 {resultCount} 条
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function RandomUnplayedChartCard({
  title,
  badge,
  onPress,
}: {
  title: string;
  badge: ReactNode;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={`查看谱面 ${title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.unplayedCard, { backgroundColor: theme.surface }]}
    >
      <Text numberOfLines={1} style={[styles.unplayedTitle, { color: theme.text }]}>
        {title}
      </Text>
      <View style={styles.unplayedTags}>
        {badge}
        <Text style={[styles.unplayedHint, { color: theme.textMuted }]}>未游玩</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  heading: { fontSize: 16, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    minHeight: 34,
    minWidth: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF' },
  filterContainer: {
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  poolHint: { fontSize: 12, marginBottom: 10 },
  poolErrorRow: { marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  poolErrorText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  retryButton: { minHeight: 30, minWidth: 60, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  retryButtonText: { fontSize: 12, fontWeight: '800' },
  drawButton: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  resultSection: { gap: 10 },
  resultList: { gap: 10 },
  emptyText: { fontSize: 13, lineHeight: 20 },
  hint: { fontSize: 12, marginTop: 4 },
  unplayedCard: { borderRadius: 14, padding: 14, gap: 6 },
  unplayedTitle: { fontSize: 15, fontWeight: '700' },
  unplayedTags: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unplayedHint: { fontSize: 12, fontWeight: '600' },
});

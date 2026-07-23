import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { Card } from '@/components/Card';
import { FilterChipFrame, NeutralChip } from '@/components/MaimaiFilterBar';
import { QueryStateView } from '@/components/QueryStateView';
import { ScoreRecordCard, type ScoreRecordCardData } from '@/components/ScoreRecordCard';
import { DIFFICULTY_VISUAL, DifficultyBadge } from '@/components/ScoreVisuals';
import { SourceStatus } from '@/components/SourceStatus';
import { chartVersionKey, normalizeSongId } from '@/domain/catalog';
import type { CatalogSnapshot, Difficulty, ScoreRecord } from '@/domain/models';
import {
  filterRandomCharts,
  pickRandomCharts,
  type RandomChartPick,
  type RandomPlayedFilter,
} from '@/domain/random-charts';
import type { RandomChartsCount } from '@/features/toolbox/random-charts-preferences';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useRandomChartsFilter } from '@/state/random-charts-filter';
import { useAppTheme } from '@/theme/app-theme';

const COUNTS: readonly RandomChartsCount[] = [1, 2, 3, 4];
const DIFFICULTIES: Difficulty[] = ['basic', 'advanced', 'expert', 'master', 'remaster'];
const PLAYED_OPTIONS: readonly { value: RandomPlayedFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'played', label: '已游玩' },
  { value: 'unplayed', label: '未游玩' },
];

function toggleDifficulty(current: readonly Difficulty[], difficulty: Difficulty): Difficulty[] {
  return current.includes(difficulty)
    ? current.filter((item) => item !== difficulty)
    : [...current, difficulty];
}

function Chip({
  label,
  active,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
        active && { backgroundColor: theme.accent, borderColor: theme.accent },
      ]}
    >
      <Text style={[styles.chipText, { color: theme.textSecondary }, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function buildBestRecordMap(records: readonly ScoreRecord[]): Map<string, ScoreRecord> {
  const best = new Map<string, ScoreRecord>();
  for (const record of records) {
    const key = chartVersionKey(record.songId, record.type, record.levelIndex);
    const current = best.get(key);
    if (!current || record.achievements > current.achievements) best.set(key, record);
  }
  return best;
}

function toScoreCardData(
  pick: RandomChartPick,
  bestByChart: Map<string, ScoreRecord>,
): ScoreRecordCardData {
  const key = chartVersionKey(pick.songId, pick.type, pick.levelIndex);
  const record = bestByChart.get(key);
  if (record) {
    return {
      songId: normalizeSongId(record.songId),
      title: record.title,
      type: record.type,
      difficulty: record.difficulty,
      difficultyConstant: record.difficultyConstant,
      levelIndex: record.levelIndex,
      achievements: record.achievements,
      rating: record.rating,
      fc: record.fc,
      fs: record.fs,
      rate: record.rate,
    };
  }
  return {
    songId: pick.songId,
    title: pick.title,
    type: pick.type,
    difficulty: pick.difficulty,
    difficultyConstant: pick.difficultyConstant,
    levelIndex: pick.levelIndex,
  };
}

export default function RandomChartsToolScreen() {
  const theme = useAppTheme();
  const catalog = useDetailedCatalog();
  const scores = useScoreSnapshot();
  const {
    count, difficulties, constantMin, constantMax, played,
    hydrate, setCount, setDifficulties, setConstantMin, setConstantMax, setPlayed,
  } = useRandomChartsFilter();
  const [results, setResults] = useState<RandomChartPick[] | null>(null);
  const [lastSeed, setLastSeed] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const records = scores.data?.records ?? [];
  const scoresAvailable = !!scores.data;
  const bestByChart = useMemo(() => buildBestRecordMap(records), [records]);
  const filters = useMemo(() => ({
    difficulties,
    constantMin,
    constantMax,
    played,
  }), [difficulties, constantMin, constantMax, played]);

  const poolSize = useMemo(() => {
    if (!catalog.data) return 0;
    if (played !== 'all' && !scoresAvailable) return 0;
    return filterRandomCharts(catalog.data, records, filters).length;
  }, [catalog.data, filters, played, records, scoresAvailable]);

  const resultCards = useMemo(() => {
    if (!results) return [];
    return results.map((pick) => ({
      key: `${lastSeed}-${pick.songId}:${pick.type}:${pick.levelIndex}`,
      data: toScoreCardData(pick, bestByChart),
    }));
  }, [bestByChart, lastSeed, results]);

  const draw = () => {
    if (!catalog.data) return;
    if (played !== 'all' && !scoresAvailable) {
      setResults([]);
      setLastSeed(null);
      return;
    }
    const seed = `${Date.now()}-${Math.random()}`;
    setLastSeed(seed);
    setResults(pickRandomCharts({
      catalog: catalog.data,
      records,
      filters,
      count,
      seed,
    }));
  };

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: '随机歌曲' }} />
      <QueryStateView<CatalogSnapshot>
        isLoading={catalog.isLoading}
        isError={catalog.isError}
        isEmpty={false}
        error={catalog.error}
        onRetry={() => { void catalog.refetch(); void scores.refetch(); }}
        data={catalog.data}
        renderData={(data) => (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <SourceStatus items={[
              {
                key: 'catalog',
                label: data.source.label,
                updatedAt: data.source.updatedAt,
                state: data.source.isStale ? 'cache' : 'live',
              },
              {
                key: 'scores',
                label: scores.data?.source?.label ?? '成绩不可用，已游玩筛选暂不可用',
                updatedAt: scores.data?.source?.updatedAt,
                state: !scores.data ? 'unavailable' : scores.data.source?.isStale ? 'cache' : 'live',
              },
            ]} />

            <Card>
              <Text style={[styles.heading, { color: theme.text }]}>抽取数量</Text>
              <View style={styles.chipRow}>
                {COUNTS.map((value) => (
                  <Chip
                    key={value}
                    label={String(value)}
                    active={count === value}
                    accessibilityLabel={`抽取 ${value} 首`}
                    onPress={() => setCount(value)}
                  />
                ))}
              </View>

              <View style={[styles.filterRow, styles.sectionGap]}>
                <Text style={[styles.filterLabel, { color: theme.textMuted }]}>难度</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.difficultyChipRow}>
                  <NeutralChip
                    label="全部"
                    active={difficulties.length === 0}
                    onPress={() => setDifficulties([])}
                  />
                  {DIFFICULTIES.map((difficulty) => {
                    const active = difficulties.includes(difficulty);
                    return (
                      <FilterChipFrame
                        key={difficulty}
                        active={active}
                        accessibilityLabel={`筛选难度 ${DIFFICULTY_VISUAL[difficulty].label}`}
                        onPress={() => setDifficulties(toggleDifficulty(difficulties, difficulty))}
                      >
                        <DifficultyBadge difficulty={difficulty} compact />
                      </FilterChipFrame>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={[styles.filterRow, styles.sectionGap]}>
                <Text style={[styles.filterLabel, { color: theme.textMuted }]}>定数</Text>
                <View style={styles.rangeRow}>
                  <TextInput
                    accessibilityLabel="最低定数"
                    autoCorrect={false}
                    keyboardType="decimal-pad"
                    placeholder="下限"
                    placeholderTextColor={theme.textMuted}
                    value={constantMin}
                    onChangeText={setConstantMin}
                    style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                  />
                  <Text style={[styles.rangeSeparator, { color: theme.textMuted }]}>~</Text>
                  <TextInput
                    accessibilityLabel="最高定数"
                    autoCorrect={false}
                    keyboardType="decimal-pad"
                    placeholder="上限"
                    placeholderTextColor={theme.textMuted}
                    value={constantMax}
                    onChangeText={setConstantMax}
                    style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                  />
                </View>
              </View>

              <Text style={[styles.heading, styles.sectionGap, { color: theme.text }]}>游玩状态</Text>
              <View style={styles.chipRow}>
                {PLAYED_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    active={played === option.value}
                    onPress={() => setPlayed(option.value)}
                  />
                ))}
              </View>

              <Text style={[styles.poolHint, { color: theme.textMuted }]}>
                {played !== 'all' && !scoresAvailable
                  ? '当前无成绩数据，无法按游玩状态筛选'
                  : `候选谱面 ${poolSize} 条`}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={results ? '再抽一次' : '抽取'}
                onPress={draw}
                style={[styles.drawButton, { backgroundColor: theme.accent }]}
              >
                <Text style={styles.drawButtonText}>{results ? '再抽一次' : '抽取'}</Text>
              </Pressable>
            </Card>

            {results ? (
              <View style={styles.resultSection}>
                <Text style={[styles.heading, { color: theme.text }]}>抽取结果</Text>
                {results.length === 0 ? (
                  <Card>
                    <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                      {played !== 'all' && !scoresAvailable
                        ? '需要成绩数据才能按已游玩/未游玩筛选，请先绑定查分器或导入成绩。'
                        : '没有符合条件的谱面，请放宽筛选后再试。'}
                    </Text>
                  </Card>
                ) : (
                  <View style={styles.resultList}>
                    {resultCards.map((item) => (
                      <ScoreRecordCard key={item.key} record={item.data} />
                    ))}
                    {results.length < count && poolSize > 0 ? (
                      <Text style={[styles.hint, { color: theme.textMuted }]}>
                        候选不足 {count} 条，已返回全部 {results.length} 条
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
            ) : null}
          </ScrollView>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  heading: { fontSize: 16, fontWeight: '700' },
  sectionGap: { marginTop: 16 },
  hint: { fontSize: 12, marginTop: 4 },
  poolHint: { fontSize: 12, marginTop: 14, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterLabel: { fontSize: 12, fontWeight: '600', width: 36 },
  difficultyChipRow: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingRight: 4 },
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
  rangeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  rangeInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 0,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  rangeSeparator: { fontSize: 13, fontWeight: '700' },
  drawButton: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  resultSection: { gap: 10 },
  resultList: { gap: 10 },
  emptyText: { fontSize: 13, lineHeight: 20 },
});

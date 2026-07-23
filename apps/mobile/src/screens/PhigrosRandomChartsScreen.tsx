import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { Card } from '@/components/Card';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import { LevelChip, NeutralChip } from '@/components/phigros/PhigrosFilterBar';
import { PhigrosDifficultyBadge } from '@/components/phigros/PhigrosDifficultyBadge';
import { PhigrosScoreCard } from '@/components/phigros/PhigrosScoreCard';
import { chartVersionKey } from '@/domain/catalog';
import type { CatalogSnapshot, Difficulty, ScoreRecord } from '@/domain/models';
import {
  PHIGROS_LEVELS,
  phigrosLevelToDifficulty,
} from '@/domain/phigros-filters';
import type { PhigrosLevel } from '@/domain/phigros';
import {
  filterRandomCharts,
  pickRandomCharts,
  type RandomChartPick,
  type RandomPlayedFilter,
} from '@/domain/random-charts';
import { buildPhigrosNoteTotalByKey } from '@/features/phigros-best-image/phigros-best-image-custom';
import type { PhigrosRandomChartsCount } from '@/features/toolbox/phigros-random-charts-preferences';
import { useGameData } from '@/hooks/use-game-data';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { phigrosChartNoteKey } from '@/domain/phigros-xing';
import { usePhigrosRandomChartsFilter } from '@/state/phigros-random-charts-filter';
import { useAppTheme } from '@/theme/app-theme';

const COUNTS: readonly PhigrosRandomChartsCount[] = [1, 2, 3, 4];
const PLAYED_OPTIONS: readonly { value: RandomPlayedFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'played', label: '已游玩' },
  { value: 'unplayed', label: '未游玩' },
];

function difficultyToLevel(difficulty: Difficulty): PhigrosLevel | null {
  const match = PHIGROS_LEVELS.find((level) => phigrosLevelToDifficulty(level) === difficulty);
  return match ?? null;
}

function toggleDifficulty(current: readonly Difficulty[], difficulty: Difficulty): Difficulty[] {
  return current.includes(difficulty)
    ? current.filter((item) => item !== difficulty)
    : [...current, difficulty];
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

function CountChip({
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

function UnplayedChartCard({ pick }: { pick: RandomChartPick }) {
  const theme = useAppTheme();
  const openDetail = () => router.push({
    pathname: '/songs/[songId]',
    params: { songId: pick.songId, levelIndex: String(pick.levelIndex) },
  } as Href);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`查看谱面 ${pick.title}`}
      onPress={openDetail}
      style={[styles.unplayedCard, { backgroundColor: theme.surface }]}
    >
      <View style={styles.unplayedMain}>
        <Text numberOfLines={1} style={[styles.unplayedTitle, { color: theme.text }]}>{pick.title}</Text>
        <View style={styles.unplayedTags}>
          <PhigrosDifficultyBadge levelIndex={pick.levelIndex} constant={pick.difficultyConstant} />
          <Text style={[styles.unplayedHint, { color: theme.textMuted }]}>未游玩</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function PhigrosRandomChartsScreen() {
  const theme = useAppTheme();
  const catalogQuery = usePhigrosCatalog();
  const gameData = useGameData();
  const {
    count, difficulties, constantMin, constantMax, played,
    hydrate, setCount, setDifficulties, setConstantMin, setConstantMax, setPlayed,
  } = usePhigrosRandomChartsFilter();
  const [results, setResults] = useState<RandomChartPick[] | null>(null);
  const [lastSeed, setLastSeed] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const catalog = catalogQuery.data?.snapshot;
  const phigrosPayload = gameData.data?.payload.kind === 'phigros' ? gameData.data.payload : null;
  const records = phigrosPayload?.records ?? [];
  const scoresAvailable = !!phigrosPayload;
  const bestByChart = useMemo(() => buildBestRecordMap(records), [records]);
  const noteTotalByKey = useMemo(
    () => buildPhigrosNoteTotalByKey(catalog?.songs ?? []),
    [catalog?.songs],
  );
  const filters = useMemo(() => ({
    difficulties,
    constantMin,
    constantMax,
    played,
  }), [difficulties, constantMin, constantMax, played]);

  const selectedLevels = useMemo(() => {
    const levels = new Set<PhigrosLevel>();
    for (const difficulty of difficulties) {
      const level = difficultyToLevel(difficulty);
      if (level != null) levels.add(level);
    }
    return levels;
  }, [difficulties]);

  const poolSize = useMemo(() => {
    if (!catalog) return 0;
    if (played !== 'all' && !scoresAvailable) return 0;
    return filterRandomCharts(catalog, records, filters).length;
  }, [catalog, filters, played, records, scoresAvailable]);

  const draw = () => {
    if (!catalog) return;
    if (played !== 'all' && !scoresAvailable) {
      setResults([]);
      setLastSeed(null);
      return;
    }
    const seed = `${Date.now()}-${Math.random()}`;
    setLastSeed(seed);
    setResults(pickRandomCharts({
      catalog,
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
        isLoading={catalogQuery.isLoading}
        isError={catalogQuery.isError}
        isEmpty={false}
        error={catalogQuery.error}
        onRetry={() => { void catalogQuery.refetch(); void gameData.refetch(); }}
        data={catalog}
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
                label: phigrosPayload?.source.label ?? '成绩不可用，已游玩筛选暂不可用',
                updatedAt: phigrosPayload?.source.updatedAt,
                state: !phigrosPayload ? 'unavailable' : phigrosPayload.source.isStale ? 'cache' : 'live',
              },
            ]} />

            <Card>
              <Text style={[styles.heading, { color: theme.text }]}>抽取数量</Text>
              <View style={styles.chipRow}>
                {COUNTS.map((value) => (
                  <CountChip
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
                  {PHIGROS_LEVELS.map((level) => {
                    const difficulty = phigrosLevelToDifficulty(level);
                    const active = selectedLevels.has(level);
                    return (
                      <LevelChip
                        key={level}
                        level={level}
                        active={active}
                        onPress={() => setDifficulties(toggleDifficulty(difficulties, difficulty))}
                      />
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
                  <CountChip
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
                        ? '需要成绩数据才能按已游玩/未游玩筛选，请先绑定 TapTap 云存档。'
                        : '没有符合条件的谱面，请放宽筛选后再试。'}
                    </Text>
                  </Card>
                ) : (
                  <View style={styles.resultList}>
                    {results.map((pick) => {
                      const key = `${lastSeed}-${pick.songId}:${pick.type}:${pick.levelIndex}`;
                      const record = bestByChart.get(chartVersionKey(pick.songId, pick.type, pick.levelIndex));
                      if (record) {
                        return (
                          <PhigrosScoreCard
                            key={key}
                            record={record}
                            catalogTitle={pick.title}
                            totalNotes={noteTotalByKey[phigrosChartNoteKey(record.songId, record.levelIndex)]}
                          />
                        );
                      }
                      return <UnplayedChartCard key={key} pick={pick} />;
                    })}
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
  unplayedCard: { borderRadius: 14, padding: 14 },
  unplayedMain: { gap: 6 },
  unplayedTitle: { fontSize: 15, fontWeight: '700' },
  unplayedTags: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unplayedHint: { fontSize: 12, fontWeight: '600' },
});

import { memo, useCallback, useMemo } from 'react';
import { router, type Href } from 'expo-router';
import { Pressable, SectionList, StyleSheet, Text, View, type SectionListRenderItem } from 'react-native';
import { EmptyDataView } from '@/components/EmptyDataView';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { QueryStateView } from '@/components/QueryStateView';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { PhigrosScoreCard } from '@/components/phigros/PhigrosScoreCard';
import { SourceStatus } from '@/components/SourceStatus';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import type { BestListSection } from '@/domain/game-data';
import type { DataSource, ScoreRecord } from '@/domain/models';
import { useGameData } from '@/hooks/use-game-data';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

type BestSection = BestListSection & { data: ScoreRecord[] };

function byRating(left: ScoreRecord, right: ScoreRecord): number {
  return right.rating - left.rating || right.achievements - left.achievements;
}

function sortPhigrosSection(sectionId: string, records: ScoreRecord[]): ScoreRecord[] {
  if (sectionId === 'phi3') {
    return [...records].sort(
      (a, b) => b.difficultyConstant - a.difficultyConstant || b.rating - a.rating,
    );
  }
  return [...records].sort(byRating);
}

export default function Best50TabScreen() {
  return <CachedTabScreen><Best50Screen /></CachedTabScreen>;
}

export function Best50Screen() {
  const activeGameId = useSession((s) => s.activeGameId);
  if (activeGameId === 'phigros') {
    return <PhigrosBestScreen />;
  }
  return <MaimaiBest50Screen />;
}

function MaimaiBest50Screen() {
  const { data, isLoading, isError, error, refetch } = useGameData();
  const tabBottomInset = useNativeTabBottomInset();
  const theme = useAppTheme();
  const sections = useMemo(() => {
    if (!data || data.payload.kind !== 'maimai') return [];
    return data.payload.bestSections.map((section) => ({
      ...section,
      data: [...section.records].sort(byRating),
    }));
  }, [data]);
  const recordCount = sections.reduce((sum, section) => sum + section.data.length, 0);
  const maimai = data?.payload.kind === 'maimai' ? data.payload : null;

  if (!isLoading && data && data.payload.kind !== 'maimai') {
    return <EmptyDataView title="暂无最佳成绩" detail="当前游戏暂未接入最佳成绩" />;
  }

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <QueryStateView<BestSection[]>
        isLoading={isLoading}
        isError={isError}
        isEmpty={!!maimai && recordCount === 0}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        emptyText="当前账号暂无最佳成绩"
        data={recordCount > 0 ? sections : undefined}
        renderData={(list) => (
          <SectionList
            testID="best50-results-list"
            contentInsetAdjustmentBehavior="automatic"
            style={styles.list}
            contentContainerStyle={[styles.listContent, { paddingBottom: tabBottomInset + 16 }]}
            scrollIndicatorInsets={{ bottom: tabBottomInset }}
            sections={list}
            {...TAB_LIST_CACHE_PROPS}
            stickySectionHeadersEnabled={false}
            keyExtractor={(record) => `${record.songId}-${record.type}-${record.levelIndex}-${record.version}`}
            ListHeaderComponent={<View style={styles.header}>
              <Pressable
                accessibilityLabel="生成B50图片"
                accessibilityRole="button"
                onPress={() => router.push('/best-image' as Href)}
                style={[styles.generateButton, { backgroundColor: theme.accent }]}
              >
                <Text style={styles.generateButtonText}>生成B50图片</Text>
              </Pressable>
              <SourceStatus items={maimai ? [
                { key: 'scores', label: maimai.source.label, updatedAt: maimai.source.updatedAt, state: maimai.source.isStale ? 'cache' : 'live' },
                { key: 'catalog', label: maimai.catalogSource.label, updatedAt: maimai.catalogSource.updatedAt, state: maimai.catalogSource.isStale ? 'cache' : 'live' },
              ] : []} />
            </View>}
            renderSectionHeader={({ section }) => <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
              <Text style={[styles.sectionCount, { color: theme.textMuted }]}>{section.data.length} 张谱面</Text>
            </View>}
            renderItem={({ item, index }) => <ScoreRecordCard record={item} rank={index + 1} />}
          />
        )}
      />
    </View>
  );
}

function PhigrosBestScreen() {
  const session = useSession((s) => s.session);
  const gameData = useGameData();
  const catalogQuery = usePhigrosCatalog();
  const tabBottomInset = useNativeTabBottomInset();
  const theme = useAppTheme();
  const hasSession = session?.mode === 'phi-session';
  const phigrosPayload = gameData.data?.payload.kind === 'phigros' ? gameData.data.payload : null;

  const titleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const song of catalogQuery.data?.snapshot.songs ?? []) {
      map.set(song.id, song.title);
    }
    return map;
  }, [catalogQuery.data?.snapshot.songs]);

  const sections = useMemo(() => {
    if (!phigrosPayload) return [];
    return phigrosPayload.bestSections.map((section) => ({
      ...section,
      data: sortPhigrosSection(section.id, section.records),
    }));
  }, [phigrosPayload]);

  const recordCount = sections.reduce((sum, section) => sum + section.data.length, 0);
  const isGameLoading = gameData.isLoading || catalogQuery.isLoading;
  const isGameError = gameData.isError || catalogQuery.isError;
  const error = gameData.error ?? catalogQuery.error;
  const refetchAll = () => {
    void Promise.all([gameData.refetch(), catalogQuery.refetch()]);
  };

  const source: DataSource = phigrosPayload?.source ?? {
    kind: 'generated',
    label: 'TapTap云存档',
    updatedAt: new Date().toISOString(),
    isStale: false,
  };
  const catalogSource: DataSource = phigrosPayload?.catalogSource
    ?? catalogQuery.data?.snapshot.source
    ?? {
      kind: 'generated',
      label: 'Phigros',
      updatedAt: new Date().toISOString(),
      isStale: false,
    };

  if (!hasSession && !isGameLoading) {
    return (
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <View style={styles.center}>
          <Text style={[styles.statusText, { color: theme.textMuted }]}>尚未绑定 TapTap 账号</Text>
          <Text style={[styles.statusHint, { color: theme.textMuted }]}>请在游戏管理中绑定 Phigros 的 TapTap 云存档</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <QueryStateView<BestSection[]>
        isLoading={isGameLoading}
        isError={isGameError}
        isEmpty={!isGameLoading && recordCount === 0}
        error={error}
        onRetry={refetchAll}
        emptyText="当前账号暂无最佳成绩"
        data={!isGameLoading && recordCount > 0 ? sections : undefined}
        renderData={(list) => (
          <PhigrosBestList
            sections={list}
            source={source}
            catalogSource={catalogSource}
            titleMap={titleMap}
            tabBottomInset={tabBottomInset}
          />
        )}
      />
    </View>
  );
}

const PhigrosBestList = memo(function PhigrosBestList({
  sections,
  source,
  catalogSource,
  titleMap,
  tabBottomInset,
}: {
  sections: BestSection[];
  source: DataSource;
  catalogSource: DataSource;
  titleMap: Map<string, string>;
  tabBottomInset: number;
}) {
  const theme = useAppTheme();

  const header = useMemo(() => (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="生成B30图片"
        accessibilityRole="button"
        onPress={() => router.push('/best-image' as Href)}
        style={[styles.generateButton, { backgroundColor: theme.accent }]}
      >
        <Text style={styles.generateButtonText}>生成B30图片</Text>
      </Pressable>
      <SourceStatus items={[
        { key: 'scores', label: source.label, updatedAt: source.updatedAt, state: source.isStale ? 'cache' : 'live' },
        { key: 'catalog', label: catalogSource.label, updatedAt: catalogSource.updatedAt, state: catalogSource.isStale ? 'cache' : 'live' },
      ]} />
    </View>
  ), [catalogSource, source, theme.accent]);

  const renderSectionHeader = useCallback(({ section }: { section: BestSection }) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
      <Text style={[styles.sectionCount, { color: theme.textMuted }]}>{section.data.length} 张谱面</Text>
    </View>
  ), [theme.text, theme.textMuted]);

  const renderItem: SectionListRenderItem<ScoreRecord, BestSection> = useCallback(({ item, index }) => (
    <PhigrosScoreCard
      record={item}
      catalogTitle={titleMap.get(item.songId) ?? item.songId}
      rank={index + 1}
    />
  ), [titleMap]);

  return (
    <SectionList
      testID="phigros-best-results-list"
      contentInsetAdjustmentBehavior="automatic"
      style={styles.list}
      contentContainerStyle={[styles.listContent, { paddingBottom: tabBottomInset + 16 }]}
      scrollIndicatorInsets={{ bottom: tabBottomInset }}
      sections={sections}
      {...TAB_LIST_CACHE_PROPS}
      stickySectionHeadersEnabled={false}
      keyExtractor={(record) => `${record.songId}-${record.levelIndex}`}
      ListHeaderComponent={header}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
    />
  );
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  header: { gap: 9, marginBottom: 2 },
  generateButton: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#246BFD',
  },
  generateButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  sectionHeader: { marginTop: 10, marginBottom: 2, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { color: '#111827', fontSize: 18, fontWeight: '800' },
  sectionCount: { color: '#8A93A3', fontSize: 11 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
  statusText: { fontSize: 16, fontWeight: '600' },
  statusHint: { fontSize: 13, textAlign: 'center' },
});

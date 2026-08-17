import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, type SectionListRenderItem } from 'react-native';
import { BestImageEntryButton } from '@/components/BestImageEntryButton';
import { EmptyDataView } from '@/components/EmptyDataView';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { BestListPage } from '@/components/game-content/GameListPages';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { ChunithmScoreCard } from '@/components/chunithm/ChunithmScoreCard';
import { PhigrosScoreCard } from '@/components/phigros/PhigrosScoreCard';
import { SourceStatus } from '@/components/SourceStatus';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import {
  buildChunithmScoreCards,
  compareChunithmScores,
  type ChunithmScoreCardData,
} from '@/domain/chunithm-score-presentation';
import type { BestListSection, ChunithmBestListSection } from '@/domain/game-data';
import type { DataSource, ScoreRecord } from '@/domain/models';
import { canReadChunithmScores, canReadPhigrosScores } from '@/domain/provider-capabilities';
import { phigrosChartNoteKey } from '@/domain/phigros-xing';
import { buildPhigrosNoteTotalByKey } from '@/features/phigros-best-image/phigros-best-image-custom';
import { useGameData } from '@/hooks/use-game-data';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useSession, UNBOUND_ACCOUNT_ID } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { TufBestScreen } from '@/screens/TufScreens';
import { MuseDashBestScreen } from '@/screens/MuseDashScreens';
import { PhiraBestScreen } from '@/screens/PhiraScreens';
import { OsuBestScreen } from '@/screens/OsuScreens';
import { isOsuGameId } from '@/domain/game-mode-family';

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
  const activeAccountId = useSession((s) => s.activeAccountId);
  if (activeAccountId === UNBOUND_ACCOUNT_ID) {
    return <EmptyDataView title="暂无绑定账号" detail="请先在设置 → 游戏管理中绑定账号" />;
  }
  if (activeGameId === 'chunithm') {
    return <ChunithmBestScreen />;
  }
  if (activeGameId === 'phigros') {
    return <PhigrosBestScreen />;
  }
  if (activeGameId === 'phira') return <PhiraBestScreen />;
  if (isOsuGameId(activeGameId)) return <OsuBestScreen />;
  if (activeGameId === 'adofai') {
    return <TufBestScreen />;
  }
  if (activeGameId === 'musedash') {
    return <MuseDashBestScreen />;
  }
  return <MaimaiBest50Screen />;
}

type ChunithmBestSection = ChunithmBestListSection & { data: ChunithmScoreCardData[] };

function ChunithmBestScreen() {
  const session = useSession((s) => s.session);
  const activeProviderId = useSession((s) => s.activeProviderId);
  const gameData = useGameData();
  const catalogQuery = useChunithmCatalog();
  const tabBottomInset = useNativeTabBottomInset();
  const theme = useAppTheme();
  const canReadScores = canReadChunithmScores(activeProviderId, session?.mode);
  const payload = gameData.data?.payload.kind === 'chunithm' ? gameData.data.payload : null;

  const sections = useMemo<ChunithmBestSection[]>(() => {
    if (!payload || !catalogQuery.data) return [];
    return payload.bestSections.map((section) => ({
      ...section,
      data: buildChunithmScoreCards(section.scores, catalogQuery.data)
        .sort(compareChunithmScores),
    }));
  }, [catalogQuery.data, payload]);

  const recordCount = sections.reduce((sum, section) => sum + section.data.length, 0);
  const isGameLoading = gameData.isLoading || catalogQuery.isLoading;
  const isGameError = gameData.isError || catalogQuery.isError;
  const error = gameData.error ?? catalogQuery.error;
  const refetchAll = () => {
    void Promise.all([gameData.refetch(), catalogQuery.refetch()]);
  };

  if (!canReadScores && !isGameLoading) {
    return (
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <View style={styles.center}>
          <Text style={[styles.statusText, { color: theme.textMuted }]}>尚未绑定落雪账号</Text>
          <Text style={[styles.statusHint, { color: theme.textMuted }]}>请在游戏管理中绑定中二节奏的落雪账号</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <BestListPage<ChunithmScoreCardData, ChunithmBestSection>
        isLoading={isGameLoading}
        isError={isGameError}
        isEmpty={!isGameLoading && recordCount === 0}
        error={error}
        onRetry={refetchAll}
        emptyText="当前账号暂无 Best 30 与 New 20 成绩"
        data={!isGameLoading && recordCount > 0 ? sections : undefined}
        sectionListProps={{
          testID: 'chunithm-best-results-list',
          contentInsetAdjustmentBehavior: 'automatic',
          style: styles.list,
          contentContainerStyle: [styles.listContent, { paddingBottom: tabBottomInset + 16 }],
          scrollIndicatorInsets: { bottom: tabBottomInset },
          ...TAB_LIST_CACHE_PROPS,
          stickySectionHeadersEnabled: false,
          keyExtractor: (record, index) => `${record.songId}-${record.levelIndex}-${index}`,
          ListHeaderComponent: <View style={styles.header}>
              <BestImageEntryButton label="生成B50图片" />
              <SourceStatus items={payload ? [
              {
                key: 'scores',
                label: payload.source.label,
                updatedAt: payload.source.updatedAt,
                state: payload.source.isStale ? 'cache' : 'live',
              },
              {
                key: 'catalog',
                label: catalogQuery.data?.source.label ?? 'LXNS 中二节奏公共曲库',
                updatedAt: catalogQuery.data?.source.updatedAt,
                state: catalogQuery.data?.source.isStale ? 'cache' : 'live',
              },
            ] : []} />
            </View>,
          renderSectionHeader: ({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
              <Text style={[styles.sectionCount, { color: theme.textMuted }]}>{section.data.length} 张谱面</Text>
            </View>
          ),
          renderItem: ({ item, index }) => (
            <ChunithmScoreCard record={item} position={index + 1} />
          ),
        }}
      />
    </View>
  );
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
      <BestListPage<ScoreRecord, BestSection>
        isLoading={isLoading}
        isError={isError}
        isEmpty={!!maimai && recordCount === 0}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        emptyText="当前账号暂无最佳成绩"
        data={recordCount > 0 ? sections : undefined}
        sectionListProps={{
          testID: 'best50-results-list',
          contentInsetAdjustmentBehavior: 'automatic',
          style: styles.list,
          contentContainerStyle: [styles.listContent, { paddingBottom: tabBottomInset + 16 }],
          scrollIndicatorInsets: { bottom: tabBottomInset },
          ...TAB_LIST_CACHE_PROPS,
          stickySectionHeadersEnabled: false,
          keyExtractor: (record) => `${record.songId}-${record.type}-${record.levelIndex}-${record.version}`,
          ListHeaderComponent: <View style={styles.header}>
              <BestImageEntryButton label="生成B50图片" />
              <SourceStatus items={maimai ? [
                { key: 'scores', label: maimai.source.label, updatedAt: maimai.source.updatedAt, state: maimai.source.isStale ? 'cache' : 'live' },
                { key: 'catalog', label: maimai.catalogSource.label, updatedAt: maimai.catalogSource.updatedAt, state: maimai.catalogSource.isStale ? 'cache' : 'live' },
              ] : []} />
            </View>,
          renderSectionHeader: ({ section }) => <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
            <Text style={[styles.sectionCount, { color: theme.textMuted }]}>{section.data.length} 张谱面</Text>
          </View>,
          renderItem: ({ item, index }) => <ScoreRecordCard record={item} rank={index + 1} />,
        }}
      />
    </View>
  );
}

function PhigrosBestScreen() {
  const session = useSession((s) => s.session);
  const activeProviderId = useSession((s) => s.activeProviderId);
  const gameData = useGameData();
  const catalogQuery = usePhigrosCatalog();
  const tabBottomInset = useNativeTabBottomInset();
  const theme = useAppTheme();
  const canReadScores = canReadPhigrosScores(activeProviderId, session?.mode);
  const phigrosPayload = gameData.data?.payload.kind === 'phigros' ? gameData.data.payload : null;

  // useMemo 稳定引用：catalogSongs 是两个下游 useMemo 的依赖，裸 ?? [] 会在
  // 每次渲染产生新数组导致它们重复计算。
  const catalogSongs = useMemo(() => catalogQuery.data?.snapshot.songs ?? [], [catalogQuery.data]);
  const titleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const song of catalogSongs) {
      map.set(song.id, song.title);
    }
    return map;
  }, [catalogSongs]);
  const noteTotalByKey = useMemo(
    () => buildPhigrosNoteTotalByKey(catalogSongs),
    [catalogSongs],
  );

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
  const listHeader = (
    <View style={styles.header}>
      <BestImageEntryButton label="生成B30图片" />
      <SourceStatus items={[
        { key: 'scores', label: source.label, updatedAt: source.updatedAt, state: source.isStale ? 'cache' : 'live' },
        { key: 'catalog', label: catalogSource.label, updatedAt: catalogSource.updatedAt, state: catalogSource.isStale ? 'cache' : 'live' },
      ]} />
    </View>
  );
  const renderSectionHeader = useCallback(({ section }: { section: BestSection }) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
      <Text style={[styles.sectionCount, { color: theme.textMuted }]}>{section.data.length} 张谱面</Text>
    </View>
  ), [theme.text, theme.textMuted]);
  const renderItem: SectionListRenderItem<ScoreRecord, BestSection> = useCallback(
    ({ item, index }) => (
      <PhigrosScoreCard
        record={item}
        catalogTitle={titleMap.get(item.songId) ?? item.songId}
        rank={index + 1}
        totalNotes={noteTotalByKey[phigrosChartNoteKey(item.songId, item.levelIndex)]}
      />
    ),
    [noteTotalByKey, titleMap],
  );

  if (!canReadScores && !isGameLoading) {
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
      <BestListPage<ScoreRecord, BestSection>
        isLoading={isGameLoading}
        isError={isGameError}
        isEmpty={!isGameLoading && recordCount === 0}
        error={error}
        onRetry={refetchAll}
        emptyText="当前账号暂无最佳成绩"
        data={!isGameLoading && recordCount > 0 ? sections : undefined}
        sectionListProps={{
          testID: 'phigros-best-results-list',
          contentInsetAdjustmentBehavior: 'automatic',
          style: styles.list,
          contentContainerStyle: [styles.listContent, { paddingBottom: tabBottomInset + 16 }],
          scrollIndicatorInsets: { bottom: tabBottomInset },
          ...TAB_LIST_CACHE_PROPS,
          stickySectionHeadersEnabled: false,
          keyExtractor: (record) => `${record.songId}-${record.levelIndex}`,
          ListHeaderComponent: listHeader,
          renderSectionHeader,
          renderItem,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  header: { gap: 9, marginBottom: 2 },
  sectionHeader: { marginTop: 10, marginBottom: 2, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { color: '#111827', fontSize: 18, fontWeight: '800' },
  sectionCount: { color: '#8A93A3', fontSize: 11 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
  statusText: { fontSize: 16, fontWeight: '600' },
  statusHint: { fontSize: 13, textAlign: 'center' },
});

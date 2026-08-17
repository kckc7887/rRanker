import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BestListPage,
  CatalogListPage,
  RecordsListPage,
} from '@/components/game-content/GameListPages';
import { SourceStatus } from '@/components/SourceStatus';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { OsuScoreCard } from '@/components/osu/OsuScoreCard';
import { OsuSongRow } from '@/components/osu/OsuSongRow';
import { isOsuGameId, type OsuGameId } from '@/domain/game-mode-family';
import { osuCatalogSongsFromBest, type OsuBestScore } from '@/domain/osu';
import { useGameData } from '@/hooks/use-game-data';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

type OsuBestSection = { id: 'top100'; title: 'Top 100'; scores: OsuBestScore[] } & {
  data: OsuBestScore[];
};

function useActiveOsuGameId(): OsuGameId | null {
  const activeGameId = useSession((s) => s.activeGameId);
  return isOsuGameId(activeGameId) ? activeGameId : null;
}

/** osu! 最佳页：个人最佳前 100（单分区 Top 100）。 */
export function OsuBestScreen() {
  const theme = useAppTheme();
  const inset = useNativeTabBottomInset();
  const gameId = useActiveOsuGameId();
  const { data, isLoading, isError, error, refetch } = useGameData();
  const payload = data?.payload.kind === 'osu' ? data.payload : null;
  const sections = useMemo<OsuBestSection[]>(() => {
    if (!payload || payload.bestScores.length === 0) return [];
    return [{
      id: 'top100',
      title: 'Top 100',
      scores: payload.bestScores,
      data: payload.bestScores,
    }];
  }, [payload]);
  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <BestListPage<OsuBestScore, OsuBestSection>
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && sections.length === 0}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        emptyText="当前账号暂无最佳成绩"
        data={sections.length ? sections : undefined}
        sectionListProps={{
          testID: 'osu-best-results-list',
          style: styles.list,
          contentInsetAdjustmentBehavior: 'automatic',
          stickySectionHeadersEnabled: false,
          contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }],
          scrollIndicatorInsets: { bottom: inset },
          ...TAB_LIST_CACHE_PROPS,
          keyExtractor: (item) => String(item.id),
          ListHeaderComponent: (
            <View style={styles.header}>
              <SourceStatus items={payload ? [{
                key: 'scores',
                label: payload.source.label,
                updatedAt: payload.source.updatedAt,
                state: payload.source.isStale ? 'cache' : 'live',
              }] : []} />
            </View>
          ),
          renderSectionHeader: ({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
              <Text style={[styles.sectionCount, { color: theme.textMuted }]}>{section.data.length} 条成绩</Text>
            </View>
          ),
          renderItem: ({ item, index }) => (
            gameId ? <OsuScoreCard gameId={gameId} score={item} position={index + 1} /> : null
          ),
        }}
      />
    </View>
  );
}

/** osu! 成绩页：上游无「全部成绩」端点，平铺展示同一份 Top 100。 */
export function OsuRecordsScreen() {
  const theme = useAppTheme();
  const inset = useNativeTabBottomInset();
  const gameId = useActiveOsuGameId();
  const { data, isLoading, isError, error, refetch } = useGameData();
  const payload = data?.payload.kind === 'osu' ? data.payload : null;
  const scores = useMemo(() => payload?.bestScores ?? [], [payload]);
  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <RecordsListPage<OsuBestScore>
        beforeList={
          <View style={styles.header}>
            <SourceStatus items={payload ? [{
              key: 'scores',
              label: payload.source.label,
              updatedAt: payload.source.updatedAt,
              state: payload.source.isStale ? 'cache' : 'live',
            }] : []} />
          </View>
        }
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && scores.length === 0}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        emptyText="当前账号暂无成绩"
        data={scores.length ? scores : undefined}
        flatListProps={{
          testID: 'osu-records-results-list',
          style: styles.list,
          contentInsetAdjustmentBehavior: 'automatic',
          contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }],
          scrollIndicatorInsets: { bottom: inset },
          ...TAB_LIST_CACHE_PROPS,
          keyExtractor: (item) => String(item.id),
          renderItem: ({ item }) => (
            gameId ? <OsuScoreCard gameId={gameId} score={item} /> : null
          ),
        }}
      />
    </View>
  );
}

/** osu! 曲库页：由 Top 100 的 beatmapset 去重派生；难度标签无字仅空格宽度。 */
export function OsuCatalogScreen() {
  const theme = useAppTheme();
  const inset = useNativeTabBottomInset();
  const gameId = useActiveOsuGameId();
  const { data, isLoading, isError, error, refetch } = useGameData();
  const payload = data?.payload.kind === 'osu' ? data.payload : null;
  const songs = useMemo(
    () => (payload ? osuCatalogSongsFromBest(payload.bestScores) : []),
    [payload],
  );
  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <CatalogListPage
        beforeList={
          <View style={styles.header}>
            <SourceStatus items={payload ? [{
              key: 'scores',
              label: payload.source.label,
              updatedAt: payload.source.updatedAt,
              state: payload.source.isStale ? 'cache' : 'live',
            }] : []} />
          </View>
        }
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && songs.length === 0}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        emptyText="当前账号暂无成绩，曲库由最佳成绩派生"
        data={songs.length ? songs : undefined}
        flatListProps={{
          testID: 'osu-catalog-results-list',
          style: styles.list,
          contentInsetAdjustmentBehavior: 'automatic',
          contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }],
          scrollIndicatorInsets: { bottom: inset },
          ...TAB_LIST_CACHE_PROPS,
          keyExtractor: (item) => String(item.beatmapSetId),
          renderItem: ({ item }) => (
            gameId ? <OsuSongRow gameId={gameId} song={item} /> : null
          ),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  header: { gap: 9, marginBottom: 2 },
  sectionHeader: {
    marginTop: 10,
    marginBottom: 2,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  sectionCount: { fontSize: 11 },
});

import { useEffect, useMemo, useState } from 'react';
import { router, type Href } from 'expo-router';
import { QueryStateView } from '@/components/QueryStateView';
import { RandomChartsPage, RandomUnplayedChartCard } from '@/components/RandomChartsPage';
import { useStableRangeBounds } from '@/components/game-content/RangeSelector';
import { RizlineFilterBar } from '@/components/rizline/RizlineFilterBar';
import { RizlineScoreCard } from '@/components/rizline/RizlineScoreCard';
import { RizlineDifficultyBadge } from '@/components/rizline/RizlineScoreVisuals';
import { pickRandomItems } from '@/domain/random-charts';
import { rizlineCoverUrl, rizlineDifficultyIndex, type RizlineChart, type RizlineSong } from '@/domain/rizline';
import { filterRizlineSongs, matchesRizlineChart, rizlinePackOptions } from '@/domain/rizline-filters';
import { useGameData } from '@/hooks/use-game-data';
import { useRizlineCatalog } from '@/hooks/use-rizline-catalog';
import { useRizlineRandomChartsFilter } from '@/state/rizline-random-charts-filter';
import { useSession } from '@/state/session-store';

type RizlinePick = { song: RizlineSong; chart: RizlineChart };

export function RizlineRandomChartsScreen() {
  const catalogQuery = useRizlineCatalog(); const gameData = useGameData();
  const activeAccountId = useSession((state) => state.activeAccountId);
  const filter = useRizlineRandomChartsFilter(); const { hydrate } = filter;
  const [draw, setDraw] = useState<{ accountId: typeof activeAccountId; version: string; results: RizlinePick[] } | null>(null);
  useEffect(() => { void hydrate(); }, [hydrate]);
  const catalog = catalogQuery.data?.snapshot;
  const songs = useMemo(() => catalog?.songs ?? [], [catalog]);
  const payload = gameData.data?.payload.kind === 'rizline' ? gameData.data.payload : undefined;
  const records = useMemo(() => new Map(payload?.records.map((record) => [record.chartId, record])), [payload?.records]);
  const packs = useMemo(() => rizlinePackOptions(songs), [songs]);
  const constants = useMemo(() => songs.flatMap((song) => song.charts.flatMap((chart) => chart.constant === null ? [] : [chart.constant])), [songs]);
  const bounds = useStableRangeBounds(constants, { minimum: 1, maximum: 16 }, filter.constantMin, filter.constantMax, catalog?.resourceVersion ?? 'loading');
  const pool = useMemo(() => filterRizlineSongs(songs, filter).flatMap((song) => song.charts
    .filter((chart) => matchesRizlineChart(chart, filter)).map((chart) => ({ song, chart }))), [filter, songs]);
  const results = draw?.accountId === activeAccountId && draw?.version === catalog?.resourceVersion ? draw.results : null;
  return <QueryStateView data={catalog} error={catalogQuery.error} isEmpty={false}
    isLoading={catalogQuery.isLoading} isError={catalogQuery.isError} onRetry={() => void catalogQuery.refetch()}
    renderData={(data) => <RandomChartsPage count={filter.count} onCountChange={filter.setCount}
      filter={<RizlineFilterBar filter={filter} packs={packs} constantBounds={bounds} />}
      poolSize={pool.length} drawDisabled={!pool.length || gameData.isLoading}
      poolStatus={gameData.isLoading ? '正在读取成绩…' : !payload ? `候选谱面 ${pool.length} 条 · 成绩暂不可用` : undefined}
      poolError={gameData.isError ? '成绩读取失败，可继续抽取歌曲。' : null} onRetryPool={() => void gameData.refetch()}
      onDraw={() => setDraw({ accountId: activeAccountId,
        version: data.resourceVersion, results: pickRandomItems(pool, filter.count, `${Date.now()}-${Math.random()}`) })}
      hasDrawn={results !== null} resultCount={results?.length ?? 0} emptyMessage="没有符合条件的谱面，请放宽筛选后再试。"
      results={results?.map(({ song, chart }) => {
        const record = records.get(chart.id);
        if (!payload) return <RizlineScoreCard key={chart.id} title={song.title} artworkSource={rizlineCoverUrl(song)} record={{
          chartId: chart.id, songId: song.id, difficulty: chart.difficulty, levelIndex: rizlineDifficultyIndex(chart.difficulty),
          title: song.title, achievements: null, score: null, rks: null, ap: false, ahStatus: 'unknown', chart,
        }} />;
        return record ? <RizlineScoreCard key={chart.id} record={record} title={song.title} artworkSource={rizlineCoverUrl(song)} />
          : <RandomUnplayedChartCard key={chart.id} title={song.title}
            badge={<RizlineDifficultyBadge difficulty={chart.difficulty} level={chart.level} />}
            onPress={() => router.push({ pathname: '/songs/[songId]', params: { songId: song.id, levelIndex: String(rizlineDifficultyIndex(chart.difficulty)) } } as Href)} />;
      })} />}
  />;
}

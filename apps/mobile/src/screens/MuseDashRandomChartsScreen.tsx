import { useEffect, useMemo, useState } from 'react';
import { router, type Href } from 'expo-router';
import { MuseDashDifficultyBadge } from '@/components/musedash/MuseDashDifficultyBadge';
import { MuseDashRecordsFilterBar } from '@/components/musedash/MuseDashFilterBar';
import { MuseDashScoreCard } from '@/components/musedash/MuseDashScoreCard';
import { QueryStateView } from '@/components/QueryStateView';
import { RandomChartsPage, RandomUnplayedChartCard } from '@/components/RandomChartsPage';
import { museDashUserIdFromAccountId } from '@/domain/bound-account';
import {
  buildMuseDashRandomCharts,
  buildMuseDashRawScores,
  filterMuseDashRandomCharts,
  museDashSongTitle,
  museDashSongsFromAlbums,
  type MuseDashAlbumsResponse,
  type MuseDashRandomChart,
} from '@/domain/muse-dash';
import { pickRandomItems } from '@/domain/random-charts';
import {
  useMuseDashAlbums,
  useMuseDashCe,
  useMuseDashDiffdiff,
  useMuseDashPlayDetails,
  useMuseDashPlayer,
} from '@/hooks/use-muse-dash';
import { useMuseDashRandomChartsFilter } from '@/state/musedash-random-charts-filter';
import { useSession } from '@/state/session-store';

export function MuseDashRandomChartsScreen() {
  const accountId = useSession((state) => state.activeAccountId);
  const userId = museDashUserIdFromAccountId(accountId);
  const albums = useMuseDashAlbums();
  const diffdiff = useMuseDashDiffdiff();
  const ce = useMuseDashCe();
  const player = useMuseDashPlayer(userId);
  const {
    count, collapsed, difficultySlot, dlc, constantMin, constantMax, accMin, accMax,
    achievement, hydrate, setCount, setCollapsed, setDifficultySlot, setDlc,
    setConstantMin, setConstantMax, setAccMin, setAccMax, setAchievement,
    clearFilters,
  } = useMuseDashRandomChartsFilter();
  const [results, setResults] = useState<MuseDashRandomChart[] | null>(null);
  const [lastSeed, setLastSeed] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const rawScores = useMemo(() => player.data
    ? buildMuseDashRawScores(player.data, albums.data, ce.data, diffdiff.data)
    : [], [albums.data, ce.data, diffdiff.data, player.data]);
  const charts = useMemo(() => albums.data && diffdiff.data
    ? buildMuseDashRandomCharts(albums.data, diffdiff.data, rawScores)
    : [], [albums.data, diffdiff.data, rawScores]);
  const baseFilters = useMemo(() => ({
    difficultySlot, dlc, constantMin, constantMax, accMin, accMax, achievement: 'all' as const,
  }), [accMax, accMin, constantMax, constantMin, difficultySlot, dlc]);
  const detailCandidates = useMemo(
    () => filterMuseDashRandomCharts(charts, baseFilters, new Map()).flatMap((chart) => chart.score
      ? [{ uid: chart.score.play.uid, difficulty: chart.score.play.difficulty, platform: chart.score.play.platform ?? 'mobile' }]
      : []),
    [baseFilters, charts],
  );
  const missMap = useMuseDashPlayDetails(detailCandidates, userId, achievement !== 'all');
  const pool = useMemo(() => filterMuseDashRandomCharts(charts, {
    difficultySlot, dlc, constantMin, constantMax, accMin, accMax, achievement,
  }, missMap), [accMax, accMin, achievement, charts, constantMax, constantMin, difficultySlot, dlc, missMap]);
  const dlcOptions = useMemo(() => albums.data
    ? [...new Set(museDashSongsFromAlbums(albums.data).map((item) => item.albumTitle))]
    : [], [albums.data]);
  const loading = albums.isLoading || diffdiff.isLoading || ce.isLoading || (userId !== null && player.isLoading);
  const error = albums.error ?? diffdiff.error ?? ce.error ?? player.error;

  const draw = () => {
    const seed = `${Date.now()}-${Math.random()}`;
    setLastSeed(seed);
    setResults(pickRandomItems(pool, count, seed));
  };
  const openDetail = (chart: MuseDashRandomChart) => router.push({
    pathname: '/songs/[songId]',
    params: { songId: chart.song.uid, levelIndex: String(chart.difficultyIndex) },
  } as Href);

  return <QueryStateView<MuseDashAlbumsResponse>
    data={albums.data}
    error={error}
    isEmpty={!loading && charts.length === 0}
    isError={!!error}
    isLoading={loading}
    emptyText="当前曲库没有可抽取谱面"
    onRetry={() => { void albums.refetch(); void diffdiff.refetch(); void ce.refetch(); void player.refetch(); }}
    renderData={() => <RandomChartsPage
      count={count}
      emptyMessage="没有符合条件的喵斯快跑谱面，请放宽筛选后再试。"
      filter={<MuseDashRecordsFilterBar
        accMax={accMax} accMin={accMin} achievement={achievement} collapsed={collapsed}
        constantMax={constantMax} constantMin={constantMin} difficultySlot={difficultySlot}
        dlc={dlc} dlcOptions={dlcOptions} onAccMaxChange={setAccMax} onAccMinChange={setAccMin}
        onAchievementChange={setAchievement} onCollapsedChange={setCollapsed}
        onConstantMaxChange={setConstantMax} onConstantMinChange={setConstantMin}
        onDifficultySlotChange={setDifficultySlot} onDlcChange={setDlc}
        onReset={clearFilters} />}
      hasDrawn={results !== null}
      onCountChange={setCount}
      onDraw={draw}
      poolSize={pool.length}
      resultCount={results?.length ?? 0}
      results={results?.map((chart) => chart.score
        ? <MuseDashScoreCard key={`${lastSeed}-${chart.key}`} score={chart.score} />
        : <RandomUnplayedChartCard
          badge={<MuseDashDifficultyBadge constant={chart.constant} display="label-and-value"
            level={chart.officialLevel} levelIndex={chart.difficultyIndex} />}
          key={`${lastSeed}-${chart.key}`}
          onPress={() => openDetail(chart)}
          title={museDashSongTitle(chart.song)} />)}
    />}
  />;
}

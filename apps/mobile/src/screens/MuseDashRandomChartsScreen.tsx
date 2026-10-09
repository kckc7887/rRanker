import { detailTargetHref, encodeDetailTarget } from '@/domain/detail-target';
import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
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
  museDashAchievementDetailsPending,
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
  const activeFilters = useMemo(() => ({
    difficultySlot, dlc, constantMin, constantMax, accMin, accMax, achievement,
  }), [accMax, accMin, achievement, constantMax, constantMin, difficultySlot, dlc]);
  const pool = useMemo(
    () => filterMuseDashRandomCharts(charts, activeFilters, missMap.missByChart),
    [activeFilters, charts, missMap.missByChart],
  );
  const achievementDetailsPending = useMemo(
    () => museDashAchievementDetailsPending(charts, activeFilters, missMap.missByChart),
    [activeFilters, charts, missMap.missByChart],
  );
  /** 明细失败时提示重试，不能把未知候选当作不匹配。 */
  const achievementDetailsFailed = achievement === 'all' ? 0 : missMap.failedCount;
  const dlcOptions = useMemo(() => albums.data
    ? [...new Set(museDashSongsFromAlbums(albums.data).map((item) => item.albumTitle))]
    : [], [albums.data]);
  const catalog = albums.data && diffdiff.data ? albums.data : undefined;
  const loading = (!albums.data && albums.isLoading) || (!diffdiff.data && diffdiff.isLoading);
  const error = (!albums.data && albums.error) || (!diffdiff.data && diffdiff.error);
  const scoreFilterActive = accMin.trim() !== '' || accMax.trim() !== '' || achievement !== 'all';
  const poolError = [
    albums.isError || diffdiff.isError ? '曲库刷新失败，请重试。' : null,
    player.isError ? '成绩读取失败，请重试。' : null,
    ce.isError ? '角色与精灵资料读取失败。' : null,
    achievementDetailsFailed > 0 ? `${achievementDetailsFailed} 条成就明细读取失败，抽取只使用已确认的结果。` : null,
  ].filter(Boolean).join('\n') || null;

  const draw = () => {
    const seed = `${Date.now()}-${Math.random()}`;
    setLastSeed(seed);
    setResults(pickRandomItems(pool, count, seed));
  };
  const openDetail = (chart: MuseDashRandomChart) => router.push(detailTargetHref(encodeDetailTarget({ game: 'musedash', songId: chart.song.uid, levelIndex: chart.difficultyIndex })));

  return <QueryStateView<MuseDashAlbumsResponse>
    data={catalog}
    error={error}
    isEmpty={!loading && charts.length === 0}
    isError={!!error}
    isLoading={loading}
    emptyText="当前曲库没有可抽取谱面"
    onRetry={() => {
      if (!albums.data || albums.isError) void albums.refetch();
      if (!diffdiff.data || diffdiff.isError) void diffdiff.refetch();
    }}
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
      drawDisabled={(!player.data && scoreFilterActive) || achievementDetailsPending || achievementDetailsFailed > 0}
      poolSize={pool.length}
      poolStatus={!player.data ? player.isLoading ? '正在读取成绩…' : `候选谱面 ${pool.length} 条 · 成绩暂不可用` : achievementDetailsPending
        ? '正在核对成就明细…'
        : achievementDetailsFailed > 0 ? '成就明细读取失败，候选不完整。' : undefined}
      poolError={poolError}
      onRetryPool={() => {
        if (albums.isError) void albums.refetch();
        if (diffdiff.isError) void diffdiff.refetch();
        if (player.isError && userId !== null) void player.refetch();
        if (ce.isError) void ce.refetch();
        if (achievementDetailsFailed > 0) missMap.retryFailed();
      }}
      resultCount={results?.length ?? 0}
      results={results?.map((chart) => {
        const score = charts.find(item => item.key === chart.key)?.score;
        return score
          ? <MuseDashScoreCard key={`${lastSeed}-${chart.key}`} score={score} />
          : <RandomUnplayedChartCard
            scoreAvailable={player.data !== undefined}
            badge={<MuseDashDifficultyBadge constant={chart.constant} display="label-and-value"
              level={chart.officialLevel} levelIndex={chart.difficultyIndex} />}
            key={`${lastSeed}-${chart.key}`}
            onPress={() => openDetail(chart)}
            title={museDashSongTitle(chart.song)} />;
      })}
    />}
  />;
}

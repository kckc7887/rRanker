import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FixedBestImageScreen } from '@/components/FixedBestImageScreen';
import { QueryStateView } from '@/components/QueryStateView';
import { museDashUserIdFromAccountId, tufPlayerIdFromAccountId } from '@/domain/bound-account';
import { buildMuseDashRawScores, sortMuseDashRawScores, type MuseDashRawScore } from '@/domain/muse-dash';
import { resolveTufAvatarUrl, selectTufTopPasses, type TufPass } from '@/domain/tuf';
import { buildFixedBestImageHtml } from '@/features/best-image/build-fixed-best-image-html';
import { loadBestImageAssetDataUri } from '@/features/best-image/load-best-image-assets';
import { presentMuseDashScore, presentTufScore } from '@/features/game-content/adapters';
import type { BestSectionPresentation, ScoreCardPresentation } from '@/features/game-content/presentation';
import { useMuseDashAlbums, useMuseDashCe, useMuseDashDiffdiff, useMuseDashPlayDetails, useMuseDashPlayer } from '@/hooks/use-muse-dash';
import { useTufPasses, useTufProfile } from '@/hooks/use-tuf';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

const ADOFAI_ICON = require('../../assets/images/adofai.png') as number;

function EmptyBestImage({ text }: { text: string }) {
  const theme = useAppTheme();
  return <View style={[styles.center, { backgroundColor: theme.background }]}><Text style={{ color: theme.textMuted }}>{text}</Text></View>;
}

export function TufBestImageScreen() {
  const accountId = useSession((state) => state.activeAccountId);
  const playerId = tufPlayerIdFromAccountId(accountId);
  const profile = useTufProfile(playerId);
  const passes = useTufPasses(playerId, { sortBy: 'impact', order: 'DESC', bestPerLevel: true });
  const [fallbackAvatar, setFallbackAvatar] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void loadBestImageAssetDataUri(ADOFAI_ICON).then((value) => {
      if (!cancelled) setFallbackAvatar(value);
    }).catch(() => { if (!cancelled) setFallbackAvatar(null); });
    return () => { cancelled = true; };
  }, []);
  const top = useMemo(() => selectTufTopPasses(
      profile.data?.topScores ?? [],
      passes.data?.pages.flatMap((page) => page.passes) ?? [],
    ), [passes.data?.pages, profile.data?.topScores]);
  const ordered = top.passes;
  const missing = top.missing;
  const sections = useMemo<BestSectionPresentation[]>(() => [{
    id: 'top20', title: 'Top 20 Impact', items: ordered.map((pass, index) => presentTufScore(pass, index + 1)),
  }], [ordered]);
  const htmlForWidth = useCallback((width: number) => buildFixedBestImageHtml({
    width, title: 'Top20', playerName: profile.data?.name ?? 'TUF 玩家', ratingLabel: 'Rating',
    ratingDisplay: profile.data?.rankedScore.toFixed(2) ?? '—', avatarUrl: resolveTufAvatarUrl(profile.data),
    avatarFallbackUrl: fallbackAvatar, sections, dataSource: 'TUF 公开成绩', cardLayout: { asideMetricKey: 'impact' },
    theme: { accent: '#24B8E6', accentSoft: '#DFF6FC', secondaryAccent: '#F05B5B' },
  }), [fallbackAvatar, profile.data, sections]);
  const loading = profile.isLoading || passes.isLoading || fallbackAvatar === undefined;
  const error = profile.error ?? passes.error;
  if (playerId === null) return <EmptyBestImage text="请先绑定 TUF 玩家" />;
  return <QueryStateView<TufPass[]>
    data={!loading && ordered.length ? ordered : undefined} error={error} isEmpty={!loading && ordered.length === 0}
    isError={!!error} isLoading={loading} emptyText="当前公开资料没有可导出的 Top20 成绩"
    onRetry={() => { void profile.refetch(); void passes.refetch(); }}
    renderData={() => <FixedBestImageScreen disabled={ordered.length === 0} htmlForWidth={htmlForWidth}
      imageType="top20" playerName={profile.data?.name ?? 'TUF 玩家'}
      notice={missing > 0 ? `有 ${missing} 条 Top 记录未公开，已跳过。` : null} />}
  />;
}

export function MuseDashBestImageScreen() {
  const accountId = useSession((state) => state.activeAccountId);
  const userId = museDashUserIdFromAccountId(accountId);
  const player = useMuseDashPlayer(userId);
  const albums = useMuseDashAlbums();
  const ce = useMuseDashCe();
  const diffdiff = useMuseDashDiffdiff();
  const ordered = useMemo(() => player.data
    ? sortMuseDashRawScores(buildMuseDashRawScores(player.data, albums.data, ce.data, diffdiff.data)).slice(0, 30)
    : [], [albums.data, ce.data, diffdiff.data, player.data]);
  const detailItems = useMemo(() => ordered.map((score) => ({
    uid: score.play.uid, difficulty: score.play.difficulty, platform: score.play.platform ?? 'mobile',
  })), [ordered]);
  const missMap = useMuseDashPlayDetails(detailItems, userId, ordered.length > 0);
  const cards = useMemo<ScoreCardPresentation[]>(() => ordered.map((score, index) => {
    const presentation = presentMuseDashScore(score, {
      position: index + 1,
      detail: { play: { miss: missMap.get(`${score.play.uid}:${score.play.difficulty}`) } },
    });
    return {
      ...presentation,
      achievementRows: [...presentation.achievementRows, [{
        key: 'platform', label: (score.play.platform ?? 'mobile') === 'pc' ? 'PC 端' : '移动端', tone: 'muted',
      }]],
    };
  }), [missMap, ordered]);
  const sections = useMemo<BestSectionPresentation[]>(() => [{ id: 'best30', title: 'Best 30', items: cards }], [cards]);
  const htmlForWidth = useCallback((width: number) => buildFixedBestImageHtml({
    width, title: 'B30', playerName: player.data?.user.nickname ?? '喵斯快跑玩家', ratingLabel: 'Rating',
    ratingDisplay: player.data?.rl?.toFixed(2) ?? '—', sections, dataSource: 'MuseDash.moe', cardLayout: { asideMetricKey: 'rating' },
    theme: { accent: '#D743A7', accentSoft: '#F9E1F3', secondaryAccent: '#7B4FD6' },
  }), [player.data, sections]);
  const loading = player.isLoading || albums.isLoading || ce.isLoading || diffdiff.isLoading;
  const error = player.error ?? albums.error ?? ce.error ?? diffdiff.error;
  if (userId === null) return <EmptyBestImage text="请先绑定喵斯快跑玩家" />;
  return <QueryStateView<MuseDashRawScore[]>
    data={!loading && ordered.length ? ordered : undefined} error={error} isEmpty={!loading && ordered.length === 0}
    isError={!!error} isLoading={loading} emptyText="当前没有可导出的喵斯快跑成绩"
    onRetry={() => { void player.refetch(); void albums.refetch(); void ce.refetch(); void diffdiff.refetch(); }}
    renderData={() => <FixedBestImageScreen disabled={ordered.length === 0} htmlForWidth={htmlForWidth}
      imageType="best30" playerName={player.data?.user.nickname ?? '喵斯快跑玩家'} />}
  />;
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' } });

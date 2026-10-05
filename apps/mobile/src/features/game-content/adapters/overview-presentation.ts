import { formatRizlineRks, RIZLINE_RATING_THEME } from '@/domain/rizline';

import { DxRatingCard } from '@/components/DxRatingCard';
import { OSU_PP_RATING_THEME } from '@/components/osu/OsuRatingTag';

import { resolveChunithmRatingCardTheme, resolveChunithmRatingTier } from '@/domain/chunithm-rating-theme';
import { averageChunithmRating } from '@/domain/chunithm-score-presentation';
import type { ProviderId } from '@/domain/game-bind-options';
import { type BestListSection, type GameDataBundle } from '@/domain/game-data';
import { resolveMaimaiCourseRank } from '@/domain/maimai-course-rank';
import { formatPhigrosChallengeBadge, resolvePhigrosChallengeTheme } from '@/domain/phigros-challenge-theme';

import { formatTufOverviewRatingMeta, formatTufRankBadge, TUF_RATING_THEME } from '@/components/adofai/TufOverviewDetails';
import { formatMuseDashOverviewRatingMeta, MUSE_DASH_RATING_THEME } from '@/components/musedash/MuseDashOverviewDetails';
import { formatOsuPlayTime } from '@/domain/osu';

import type { ComponentProps } from 'react';

export function overviewDisplayName(bundle: GameDataBundle): string {
  if (bundle.payload.kind === 'rizline') return bundle.payload.player.username;
  if (bundle.payload.kind === 'maimai') return bundle.payload.player.displayName;
  if (bundle.payload.kind === 'phigros') return bundle.payload.player.displayName;
  if (bundle.payload.kind === 'chunithm') {
    return bundle.payload.player?.name ?? '落雪账号（待同步）';
  }
  if (bundle.payload.kind === 'adofai') return bundle.payload.player.name;
  if (bundle.payload.kind === 'musedash') return bundle.payload.player.user.nickname;
  if (bundle.payload.kind === 'majdata-net') return bundle.payload.snapshot.player.username;
  if (bundle.payload.kind === 'phira') return bundle.payload.snapshot.player.name;
  if (bundle.payload.kind === 'osu') return bundle.payload.player.username;
  return bundle.payload.displayName;
}

function maimaiCourseRankBadge(bundle: GameDataBundle): { title: string; value: string; } | undefined {
  if (bundle.payload.kind !== 'maimai') return undefined;
  const courseRank = resolveMaimaiCourseRank(bundle.payload.player);
  return courseRank ? { title: '段位认定', value: courseRank.label } : undefined;
}

function formatBestSectionMeta(sections: BestListSection[], gameId: GameDataBundle['gameId']): string {
  return sections.map((section) => {
    const label = section.id === 'b35'
      ? 'B35'
      : section.id === 'b15'
        ? 'B15'
        : section.id === 'b27'
          ? 'B27'
          : section.id === 'phi3'
            ? 'Phi3'
            : section.id.toUpperCase();
    if (gameId === 'phigros') {
      if (!section.records.length) return `${label} —`;
      if (section.id === 'phi3') {
        const avg = section.records.reduce((sum, r) => sum + r.difficultyConstant, 0) / section.records.length;
        return `${label} ${avg.toFixed(2)}`;
      }
      const avg = section.records.reduce((sum, r) => sum + r.rating, 0) / section.records.length;
      return `${label} ${avg.toFixed(2)}`;
    }
    const total = section.records.reduce((sum, record) => sum + record.rating, 0);
    return `${label} ${total}`;
  }).join(' · ');
}

function formatChunithmBestMeta(
  sections: Extract<GameDataBundle['payload'], { kind: 'chunithm'; }>['bestSections'],
): string {
  const best30 = sections.find((section) => section.id === 'b30');
  const new20 = sections.find((section) => section.id === 'new20');
  return `Best30 ${averageChunithmRating(best30?.scores ?? [])} · New20 ${averageChunithmRating(new20?.scores ?? [])}`;
}

export function syncProviderHint(providerId: ProviderId | null): string {
  if (providerId === 'rizline-official') return '官方账号';
  if (providerId === 'lxns') return '落雪咖啡屋';
  if (providerId === 'diving-fish') return '水鱼查分器';
  if (providerId === 'phi-taptap') return 'TapTap 云存档';
  if (providerId === 'phigros-test') return '示例查分器';
  if (providerId === 'local') return '本地查分器';
  if (providerId === 'maimai-test') return '示例查分器';
  if (providerId === 'chunithm-test') return '示例查分器';
  if (providerId === 'chunithm-temp') return '无成绩临时账号';
  if (providerId === 'tuf') return 'TUF 社区';
  if (providerId === 'musedash-moe') return 'MuseDash.moe';
  if (providerId === 'majdata-net') return 'Majdata Net';
  if (providerId === 'phira-community') return 'Phira社区';
  if (providerId === 'osu') return 'osu! 官方';
  return '本地';
}

type RatingCardProps = ComponentProps<typeof DxRatingCard>;
type RatedPayload = Exclude<GameDataBundle['payload'], { kind: 'empty'; }>;

function overviewRatingMeta(payload: RatedPayload, gameId: GameDataBundle['gameId']): string {
  switch (payload.kind) {
    case 'rizline': return `AH5（推定） ${formatRizlineRks(payload.best.ah5Contribution)} · B35（推定） ${formatRizlineRks(payload.best.b35Contribution)}`;
    case 'majdata-net': return '';
    case 'adofai': return formatTufOverviewRatingMeta(payload.player);
    case 'musedash': return formatMuseDashOverviewRatingMeta(payload.player);
    case 'phira': return `总游玩次数 ${payload.snapshot.stats.numRecords}`;
    case 'chunithm': return formatChunithmBestMeta(payload.bestSections);
    case 'osu': return formatOsuPlayTime(payload.player.playTimeSeconds);
    default: return formatBestSectionMeta(payload.bestSections, gameId);
  }
}
function overviewRatingTheme(payload: RatedPayload): RatingCardProps['themeOverride'] {
  switch (payload.kind) {
    case 'rizline': return RIZLINE_RATING_THEME;
    case 'adofai': return TUF_RATING_THEME;
    case 'musedash': return MUSE_DASH_RATING_THEME;
    case 'phigros': return resolvePhigrosChallengeTheme(payload.challengeModeRank);
    case 'chunithm': return resolveChunithmRatingCardTheme(payload.hasSyncedData ? payload.playerScore.value : null, payload.player?.rating_possession);
    case 'osu': return OSU_PP_RATING_THEME;
    default: return undefined;
  }
}
function overviewSideBadge(bundle: GameDataBundle): RatingCardProps['sideBadge'] {
  const payload = bundle.payload;
  switch (payload.kind) {
    case 'adofai': return { title: '世界排名', value: formatTufRankBadge(payload.player) };
    case 'phira': return { title: '平均准确率', value: `${(payload.snapshot.stats.avgAccuracy * 100).toFixed(2)}%` };
    case 'phigros': return { title: '课题模式', value: formatPhigrosChallengeBadge(payload.challengeModeRank) };
    default: return maimaiCourseRankBadge(bundle);
  }
}
export function overviewRatingCard(bundle: GameDataBundle): RatingCardProps {
  const payload = bundle.payload;
  if (payload.kind === 'empty') return {
    label: bundle.profile.ratingLabel, display: '—', rating: null,
    meta: bundle.gameId === 'chunithm' ? '请绑定落雪账号' : '当前游戏暂未提供评分',
  };
  const unsynced = payload.kind === 'chunithm' && !payload.hasSyncedData;
  return {
    borderless: unsynced, label: payload.playerScore.label, display: payload.playerScore.display,
    fitValue: payload.kind === 'majdata-net',
    accessibilityLabel: payload.kind === 'rizline' || payload.kind === 'majdata-net' ? `${payload.playerScore.label} ${payload.playerScore.display}` : undefined,
    rating: payload.kind === 'majdata-net' || unsynced ? null : payload.playerScore.value,
    meta: overviewRatingMeta(payload, bundle.gameId), themeOverride: overviewRatingTheme(payload),
    valueTheme: payload.kind === 'chunithm' && payload.hasSyncedData ? resolveChunithmRatingTier(payload.playerScore.value) : undefined,
    sideBadge: overviewSideBadge(bundle),
  };
}

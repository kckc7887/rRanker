import type { DxRatingTheme } from '@/domain/dx-rating-theme';
import type { TufPlayer } from '@/domain/tuf';

export const TUF_RATING_THEME: DxRatingTheme = {
  id: 'tuf', label: 'TUF',
  fillColors: ['#45C9F4', '#6977B8', '#F15B55'], fillLocations: [0, 0.5, 1],
  borderColors: ['#209FCB', '#8A5A91', '#C53E3B'], borderLocations: [0, 0.5, 1],
  overlayColor: 'rgba(10, 22, 38, 0.18)', textColor: '#FFFFFF', starColor: '#FFFFFF', starCount: 0,
};

export function formatTufOverviewRatingMeta(player: TufPlayer): string {
  const rank = player.globalRank ?? player.rank;
  return `世界排名 ${rank ? `#${rank}` : '—'} · ${player.totalPasses} 条公开成绩`;
}

export function formatTufRankBadge(player: TufPlayer): string {
  const rank = player.globalRank ?? player.rank;
  return rank ? `#${rank}` : '—';
}

import type { DxRatingTheme } from '@/domain/dx-rating-theme';
import type { MuseDashPlayer } from '@/domain/muse-dash';

export const MUSE_DASH_RATING_THEME: DxRatingTheme = {
  id: 'musedash', label: '喵斯',
  fillColors: ['#FF5A8A', '#C084FC', '#7C6CF5'], fillLocations: [0, 0.5, 1],
  borderColors: ['#E0447A', '#9C62E0', '#5F52D8'], borderLocations: [0, 0.5, 1],
  overlayColor: 'rgba(30, 18, 44, 0.18)', textColor: '#FFFFFF', starColor: '#FFFFFF', starCount: 0,
};

export function formatMuseDashOverviewRatingMeta(player: MuseDashPlayer): string {
  return `谱面 ${player.plays.length} 首 · 更新于 ${formatMuseDashUpdateTime(player.lastUpdate)}`;
}

export function formatMuseDashUpdateTime(lastUpdate: number | undefined): string {
  if (!lastUpdate || !Number.isFinite(lastUpdate)) return '—';
  const date = new Date(lastUpdate);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

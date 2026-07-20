import type { DxRatingTheme } from './dx-rating-theme';
import { parseChallengeModeRank } from './phigros';

const TWO_STOPS = [0, 1] as const;
const THREE_STOPS = [0, 0.52, 1] as const;

const THEMES: readonly Omit<DxRatingTheme, 'starCount'>[] = [
  {
    id: 'phigros-white',
    label: '白',
    fillColors: ['#F7F8FA', '#E8EDF2', '#DCE2E8'],
    fillLocations: THREE_STOPS,
    borderColors: ['#8C97A1', '#66727D'],
    borderLocations: TWO_STOPS,
    overlayColor: 'rgba(75,78,85,0.08)',
    textColor: '#2F3A45',
    starColor: '#4F5F70',
  },
  {
    id: 'phigros-green',
    label: '绿',
    fillColors: ['#D5F4D8', '#B7E8BF', '#96D8A4'],
    fillLocations: THREE_STOPS,
    borderColors: ['#3D7F53', '#2B6140'],
    borderLocations: TWO_STOPS,
    overlayColor: 'rgba(75,78,85,0.12)',
    textColor: '#1F4932',
    starColor: '#2F6845',
  },
  {
    id: 'phigros-blue',
    label: '蓝',
    fillColors: ['#CBE8FF', '#A9D4FA', '#84BAEF'],
    fillLocations: THREE_STOPS,
    borderColors: ['#2B628D', '#1E496B'],
    borderLocations: TWO_STOPS,
    overlayColor: 'rgba(75,78,85,0.12)',
    textColor: '#1F3954',
    starColor: '#325C84',
  },
  {
    id: 'phigros-red',
    label: '红',
    fillColors: ['#FFD0D0', '#F6A6A6', '#E78383'],
    fillLocations: THREE_STOPS,
    borderColors: ['#8B3E45', '#6C2B31'],
    borderLocations: TWO_STOPS,
    overlayColor: 'rgba(75,78,85,0.14)',
    textColor: '#4A2528',
    starColor: '#723940',
  },
  {
    id: 'phigros-gold',
    label: '金',
    fillColors: ['#FBE7A1', '#F0C761', '#DEAA3B'],
    fillLocations: THREE_STOPS,
    borderColors: ['#8E6A1C', '#6F4D12'],
    borderLocations: TWO_STOPS,
    overlayColor: 'rgba(75,78,85,0.14)',
    textColor: '#473613',
    starColor: '#775718',
  },
  {
    id: 'phigros-rainbow',
    label: '彩',
    fillColors: ['#FFA5B1', '#FBC07F', '#E7E073', '#8ED8A2', '#7BC6EA', '#9DA4E6', '#CE93DF'],
    fillLocations: [0, 0.16, 0.32, 0.48, 0.64, 0.8, 1],
    borderColors: ['#973049', '#9A5A22', '#80701B', '#2B7A45', '#2B6284', '#474E92', '#753E89'],
    borderLocations: [0, 0.16, 0.32, 0.48, 0.64, 0.8, 1],
    overlayColor: 'rgba(75,78,85,0.15)',
    textColor: '#2D3340',
    starColor: '#5E4B7D',
  },
];

export function resolvePhigrosChallengeTheme(challengeModeRank: number): DxRatingTheme {
  const parsed = parseChallengeModeRank(challengeModeRank);
  const theme = THEMES[parsed.level] ?? THEMES[0]!;
  return { ...theme, starCount: 0 };
}

export function formatPhigrosChallengeBadge(challengeModeRank: number): string {
  const parsed = parseChallengeModeRank(challengeModeRank);
  const head = THEMES[parsed.level]?.label ?? '白';
  return `${head}${parsed.rank}`;
}

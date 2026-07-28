import type { DxRatingTheme } from './dx-rating-theme';

export type ChunithmRatingTierId =
  | 'green'
  | 'orange'
  | 'red'
  | 'purple'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'rainbow';

export type ChunithmRatingTierTheme = {
  id: ChunithmRatingTierId;
  label: string;
  colors: readonly [string, ...string[]];
};

export type ChunithmPossessionId = 'none' | 'silver' | 'gold' | 'platinum' | 'rainbow';

type RatingTier = {
  min: number;
  theme: ChunithmRatingTierTheme;
};

const RATING_TIERS: readonly RatingTier[] = [
  { min: 0, theme: { id: 'green', label: '绿', colors: ['#00E676'] } },
  { min: 4, theme: { id: 'orange', label: '橙', colors: ['#FF8A00'] } },
  { min: 7, theme: { id: 'red', label: '红', colors: ['#FF2D55'] } },
  { min: 10, theme: { id: 'purple', label: '紫', colors: ['#B845FF'] } },
  { min: 12, theme: { id: 'bronze', label: '铜', colors: ['#D67A31'] } },
  { min: 13.25, theme: { id: 'silver', label: '银', colors: ['#B8D7E8'] } },
  { min: 14.5, theme: { id: 'gold', label: '金', colors: ['#FFD84D'] } },
  { min: 15.25, theme: { id: 'platinum', label: '铂金', colors: ['#8DEBFF'] } },
  {
    min: 16,
    theme: {
      id: 'rainbow',
      label: '虹',
      colors: ['#FF2D95', '#FF6B00', '#FFF200', '#00F5A0', '#00C2FF', '#7A5CFF'],
    },
  },
];

const POSSESSION_COLORS: Record<
  ChunithmPossessionId,
  readonly [string, string, ...string[]]
> = {
  none: ['#070B16', '#111C34', '#1B2C4D'],
  silver: ['#15263A', '#4F7F9C', '#9EDDF5'],
  gold: ['#281500', '#9A5700', '#FFBD00'],
  platinum: ['#092232', '#1F7F9E', '#85E8FF'],
  rainbow: ['#8D0D62', '#E53822', '#E4A700', '#00A86B', '#008ED6', '#5B32D6'],
};

const POSSESSION_LABELS: Record<ChunithmPossessionId, string> = {
  none: '无领域',
  silver: '银领域',
  gold: '金领域',
  platinum: '铂金领域',
  rainbow: '虹领域',
};

function evenlySpacedLocations(length: number): readonly [number, number, ...number[]] {
  return Array.from({ length }, (_, index) => index / (length - 1)) as unknown as
    readonly [number, number, ...number[]];
}

export function resolveChunithmRatingTier(rating: number): ChunithmRatingTierTheme {
  const value = Number.isFinite(rating) ? Math.max(0, rating) : 0;
  let matched = RATING_TIERS[0]!;
  for (const tier of RATING_TIERS) {
    if (value >= tier.min) matched = tier;
  }
  return matched.theme;
}

export function normalizeChunithmPossession(value: string | null | undefined): ChunithmPossessionId {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'silver'
    || normalized === 'gold'
    || normalized === 'platinum'
    || normalized === 'rainbow'
    ? normalized
    : 'none';
}

export function resolveChunithmPossessionTheme(
  value: string | null | undefined,
): DxRatingTheme {
  const id = normalizeChunithmPossession(value);
  const fillColors = POSSESSION_COLORS[id];
  return {
    id: `chunithm-possession-${id}`,
    label: POSSESSION_LABELS[id],
    fillColors,
    fillLocations: evenlySpacedLocations(fillColors.length),
    borderColors: ['rgba(255,255,255,0.46)', 'rgba(255,255,255,0.18)'],
    borderLocations: [0, 1],
    overlayColor: 'rgba(2,6,18,0.16)',
    textColor: '#F7FBFF',
    starColor: '#F7FBFF',
    starCount: 0,
  };
}

export const CHUNITHM_RATING_TIER_MINS = RATING_TIERS.map((tier) => tier.min);

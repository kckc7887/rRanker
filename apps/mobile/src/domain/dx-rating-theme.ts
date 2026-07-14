/**
 * 舞萌 DX Rating 牌子主题色（按官方档位表提取）。
 * 14000+ 同级牌子仅奖章颜色不同，背景同一套主题。
 */

export type DxRatingMedalTone = 'green' | 'orange' | 'red' | 'purple' | 'none';

export type DxRatingTheme = {
  id: string;
  /** 档位展示名（调试 / 无障碍） */
  label: string;
  /** LinearGradient colors，左→右 */
  colors: readonly [string, string, ...string[]];
  labelColor: string;
  valueColor: string;
  metaColor: string;
  medal: DxRatingMedalTone;
};

const MEDAL_HEX: Record<Exclude<DxRatingMedalTone, 'none'>, string> = {
  green: '#4CAF50',
  orange: '#FF9800',
  red: '#E53935',
  purple: '#9C27B0',
};

type Tier = {
  min: number;
  theme: Omit<DxRatingTheme, 'medal'> & { medal?: DxRatingMedalTone };
};

/** 从低到高；解析时取「rating >= min」的最后一档。 */
const TIERS: readonly Tier[] = [
  {
    min: 0,
    theme: {
      id: 'white-blue',
      label: '0–999',
      colors: ['#F7FCFF', '#B9DFF5'],
      labelColor: 'rgba(23, 42, 70, 0.55)',
      valueColor: '#173156',
      metaColor: 'rgba(23, 42, 70, 0.65)',
    },
  },
  {
    min: 1000,
    theme: {
      id: 'blue',
      label: '1000–1999',
      colors: ['#7ED7EC', '#2F96D4'],
      labelColor: 'rgba(255,255,255,0.78)',
      valueColor: '#FFFFFF',
      metaColor: 'rgba(255,255,255,0.82)',
    },
  },
  {
    min: 2000,
    theme: {
      id: 'green',
      label: '2000–3999',
      colors: ['#C6EF3A', '#6FBF16'],
      labelColor: 'rgba(255,255,255,0.8)',
      valueColor: '#FFFFFF',
      metaColor: 'rgba(255,255,255,0.85)',
    },
  },
  {
    min: 4000,
    theme: {
      id: 'orange',
      label: '4000–6999',
      colors: ['#F7D428', '#F09A12'],
      labelColor: 'rgba(255,255,255,0.8)',
      valueColor: '#FFFFFF',
      metaColor: 'rgba(255,255,255,0.85)',
    },
  },
  {
    min: 7000,
    theme: {
      id: 'red',
      label: '7000–9999',
      colors: ['#F289B4', '#E4335C'],
      labelColor: 'rgba(255,255,255,0.82)',
      valueColor: '#FFFFFF',
      metaColor: 'rgba(255,255,255,0.86)',
    },
  },
  {
    min: 10000,
    theme: {
      id: 'purple',
      label: '10000–11999',
      colors: ['#C9A6EA', '#7F47C4'],
      labelColor: 'rgba(255,255,255,0.82)',
      valueColor: '#FFFFFF',
      metaColor: 'rgba(255,255,255,0.86)',
    },
  },
  {
    min: 12000,
    theme: {
      id: 'bronze',
      label: '12000–12999',
      colors: ['#D4A06A', '#8C5730'],
      labelColor: 'rgba(255,255,255,0.8)',
      valueColor: '#FFFFFF',
      metaColor: 'rgba(255,255,255,0.85)',
    },
  },
  {
    min: 13000,
    theme: {
      id: 'silver',
      label: '13000–13999',
      colors: ['#F2F6FA', '#A9C0D6'],
      labelColor: 'rgba(40, 56, 78, 0.55)',
      valueColor: '#24364F',
      metaColor: 'rgba(40, 56, 78, 0.65)',
    },
  },
  {
    min: 14000,
    theme: {
      id: 'gold',
      label: '14000–14999',
      colors: ['#FFE56A', '#F0B018'],
      labelColor: 'rgba(255,255,255,0.85)',
      valueColor: '#FFFFFF',
      metaColor: 'rgba(255,255,255,0.9)',
    },
  },
  {
    min: 15000,
    theme: {
      id: 'rainbow',
      label: '15000–15999',
      colors: ['#F28A9A', '#F0C05A', '#88D96A', '#5AB8E8'],
      labelColor: 'rgba(255,255,255,0.88)',
      valueColor: '#FFFFFF',
      metaColor: 'rgba(255,255,255,0.9)',
    },
  },
  {
    min: 16000,
    theme: {
      id: 'prism',
      label: '16000+',
      colors: ['#FF4F8A', '#FFD24A', '#3FE0B0', '#7A5CFF'],
      labelColor: 'rgba(255,255,255,0.9)',
      valueColor: '#FFFFFF',
      metaColor: 'rgba(255,255,255,0.92)',
    },
  },
];

function medalFor(rating: number): DxRatingMedalTone {
  if (rating < 14000) return 'none';
  const band = Math.floor((rating % 1000) / 250);
  if (band <= 0) return 'green';
  if (band === 1) return 'orange';
  if (band === 2) return 'red';
  return 'purple';
}

export function medalColor(tone: DxRatingMedalTone): string | null {
  if (tone === 'none') return null;
  return MEDAL_HEX[tone];
}

export function resolveDxRatingTheme(rating: number): DxRatingTheme {
  const value = Number.isFinite(rating) ? Math.max(0, Math.floor(rating)) : 0;
  let matched = TIERS[0]!;
  for (const tier of TIERS) {
    if (value >= tier.min) matched = tier;
  }
  return {
    ...matched.theme,
    medal: medalFor(value),
  };
}

export const DX_RATING_TIER_MINS = TIERS.map((tier) => tier.min);

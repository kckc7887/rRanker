/** 舞萌 Rating 应用主题，参数以用户提供的 preview.html 为准。 */

export type DxRatingTheme = {
  id: string;
  label: string;
  fillColors: readonly [string, string, ...string[]];
  fillLocations: readonly [number, number, ...number[]];
  borderColors: readonly [string, string, ...string[]];
  borderLocations: readonly [number, number, ...number[]];
  overlayColor: string;
  textColor: string;
  starColor: string;
  starCount: number;
};

type Tier = {
  min: number;
  theme: Omit<DxRatingTheme, 'starCount'>;
};

const TWO_STOPS = [0, 1] as const;
const THREE_STOPS = [0, 0.52, 1] as const;

const TIERS: readonly Tier[] = [
  {
    min: 0,
    theme: {
      id: 'white', label: '白 · 0–999',
      fillColors: ['#FFFFFF', '#EBEFF2', '#DBE1E5'], fillLocations: [0, 0.5, 1],
      borderColors: ['#929BA1', '#687178'], borderLocations: TWO_STOPS,
      overlayColor: 'rgba(75,78,85,0.08)', textColor: '#303136', starColor: '#5B6167',
    },
  },
  {
    min: 1000,
    theme: {
      id: 'blue', label: '青 · 1000–1999',
      fillColors: ['#96DCED', '#76C5DF', '#65AECF'], fillLocations: THREE_STOPS,
      borderColors: ['#2A6B83', '#1D536D'], borderLocations: TWO_STOPS,
      overlayColor: 'rgba(75,78,85,0.14)', textColor: '#2B3940', starColor: '#3D5660',
    },
  },
  {
    min: 2000,
    theme: {
      id: 'green', label: '绿 · 2000–3999',
      fillColors: ['#ABDF92', '#8ACB7A', '#70B76A'], fillLocations: THREE_STOPS,
      borderColors: ['#3C7B3B', '#2B6332'], borderLocations: TWO_STOPS,
      overlayColor: 'rgba(75,78,85,0.14)', textColor: '#2D3B2E', starColor: '#446046',
    },
  },
  {
    min: 4000,
    theme: {
      id: 'yellow', label: '黄 · 4000–6999',
      fillColors: ['#F4DF81', '#E9C95C', '#DCA943'], fillLocations: THREE_STOPS,
      borderColors: ['#8B711C', '#765217'], borderLocations: TWO_STOPS,
      overlayColor: 'rgba(75,78,85,0.14)', textColor: '#453C18', starColor: '#655722',
    },
  },
  {
    min: 7000,
    theme: {
      id: 'red', label: '赤 · 7000–9999',
      fillColors: ['#F0A6AC', '#DF7F8A', '#CE6475'], fillLocations: THREE_STOPS,
      borderColors: ['#893545', '#712738'], borderLocations: TWO_STOPS,
      overlayColor: 'rgba(75,78,85,0.14)', textColor: '#452A30', starColor: '#684047',
    },
  },
  {
    min: 10000,
    theme: {
      id: 'purple', label: '紫 · 10000–11999',
      fillColors: ['#CFABDD', '#B68ACA', '#9F70B8'], fillLocations: THREE_STOPS,
      borderColors: ['#6A4679', '#523761'], borderLocations: TWO_STOPS,
      overlayColor: 'rgba(75,78,85,0.14)', textColor: '#3D2D43', starColor: '#60476A',
    },
  },
  {
    min: 12000,
    theme: {
      id: 'bronze', label: '铜 · 12000–12999',
      fillColors: ['#D4A07C', '#BB7E57', '#A36245'], fillLocations: THREE_STOPS,
      borderColors: ['#73432D', '#592F23'], borderLocations: TWO_STOPS,
      overlayColor: 'rgba(75,78,85,0.14)', textColor: '#412D25', starColor: '#624236',
    },
  },
  {
    min: 13000,
    theme: {
      id: 'silver', label: '银 · 13000–13999',
      fillColors: ['#D7E2E8', '#BCCDD4', '#A2B3BC'], fillLocations: THREE_STOPS,
      borderColors: ['#677B85', '#4F626D'], borderLocations: TWO_STOPS,
      overlayColor: 'rgba(75,78,85,0.14)', textColor: '#38464D', starColor: '#56666F',
    },
  },
  {
    min: 14000,
    theme: {
      id: 'gold', label: '金 · 14000–14499',
      fillColors: ['#F4DF86', '#E8BF49', '#D5972C'], fillLocations: THREE_STOPS,
      borderColors: ['#93711B', '#724A10'], borderLocations: TWO_STOPS,
      overlayColor: 'rgba(75,78,85,0.14)', textColor: '#473813', starColor: '#7A5A16',
    },
  },
  {
    min: 14500,
    theme: {
      id: 'platinum', label: '白金 · 14500–14999',
      fillColors: ['#F4F2E0', '#DBDCCD', '#C0C5BC'], fillLocations: THREE_STOPS,
      borderColors: ['#81867C', '#636962'], borderLocations: TWO_STOPS,
      overlayColor: 'rgba(75,78,85,0.14)', textColor: '#474B46', starColor: '#747A73',
    },
  },
  {
    min: 15000,
    theme: {
      id: 'rainbow', label: '彩 · 15000–15999',
      fillColors: ['#FF9CA8', '#FFC07E', '#EADB72', '#88CF96', '#79BFDB', '#9199DC', '#C28BD4'],
      fillLocations: [0, 0.16, 0.32, 0.48, 0.64, 0.8, 1],
      borderColors: ['#8E2437', '#984D19', '#796515', '#256B39', '#205E7A', '#384181', '#692C7C'],
      borderLocations: [0, 0.16, 0.32, 0.48, 0.64, 0.8, 1],
      overlayColor: 'rgba(75,78,85,0.16)', textColor: '#303136', starColor: '#65527A',
    },
  },
  {
    min: 16000,
    theme: {
      id: 'extreme', label: '彩极 · 16000+',
      fillColors: ['#FFFEFD', '#F8FBFF', '#EFFBFF', '#F6F1FF', '#FFF7FB'],
      fillLocations: [0, 0.22, 0.44, 0.68, 1],
      borderColors: ['#67D9FF', '#7FA9FF', '#B995FF', '#EC8DCF', '#FFB0BF'],
      borderLocations: [0, 0.24, 0.52, 0.78, 1],
      overlayColor: 'rgba(255,255,255,0.12)', textColor: '#3C4450', starColor: '#8B79C8',
    },
  },
];

function starCountFor(value: number): number {
  if (value < 14000) return 0;
  if (value < 14500) return Math.min(2, Math.floor((value - 14000) / 250) + 1);
  if (value < 15000) return Math.min(2, Math.floor((value - 14500) / 250) + 1);
  if (value < 16000) return Math.min(4, Math.floor((value - 15000) / 250) + 1);
  return Math.min(4, Math.floor((value - 16000) / 250) + 1);
}

export function resolveDxRatingTheme(rating: number): DxRatingTheme {
  const value = Number.isFinite(rating) ? Math.max(0, Math.floor(rating)) : 0;
  let matched = TIERS[0]!;
  for (const tier of TIERS) {
    if (value >= tier.min) matched = tier;
  }
  return { ...matched.theme, starCount: starCountFor(value) };
}

export const DX_RATING_TIER_MINS = TIERS.map((tier) => tier.min);

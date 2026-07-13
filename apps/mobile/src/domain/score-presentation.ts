export type CanonicalScoreRate =
  | 'd' | 'c' | 'b' | 'bb' | 'bbb' | 'a' | 'aa' | 'aaa'
  | 's' | 'sp' | 'ss' | 'ssp' | 'sss' | 'sssp' | 'unknown';

export type ScoreRateEffect = 'normal' | 'gold' | 'flowing-gold' | 'rainbow' | 'flowing-rainbow';

const SCORE_RATES = new Set<CanonicalScoreRate>([
  'd', 'c', 'b', 'bb', 'bbb', 'a', 'aa', 'aaa', 's', 'sp', 'ss', 'ssp', 'sss', 'sssp',
]);

const RATE_LABELS: Record<Exclude<CanonicalScoreRate, 'unknown'>, string> = {
  d: 'D', c: 'C', b: 'B', bb: 'BB', bbb: 'BBB', a: 'A', aa: 'AA', aaa: 'AAA',
  s: 'S', sp: 'S+', ss: 'SS', ssp: 'SS+', sss: 'SSS', sssp: 'SSS+',
};

export function normalizeScoreRate(rawRate: string | null | undefined): CanonicalScoreRate {
  const value = rawRate?.trim().toLowerCase() as CanonicalScoreRate | undefined;
  return value && SCORE_RATES.has(value) ? value : 'unknown';
}

export function scoreRateLabel(rawRate: string): string {
  const rate = normalizeScoreRate(rawRate);
  return rate === 'unknown' ? rawRate.trim().toUpperCase() || '未知' : RATE_LABELS[rate];
}

export function scoreRateEffect(rawRate: string): ScoreRateEffect {
  switch (normalizeScoreRate(rawRate)) {
    case 'sssp': return 'flowing-rainbow';
    case 'sss': return 'rainbow';
    case 'ssp': return 'flowing-gold';
    case 'ss': return 'gold';
    default: return 'normal';
  }
}

export function achievementTenThousandths(value: number): number {
  return Math.round(value * 10_000);
}

export function formatAchievement(value: number): string {
  return `${(achievementTenThousandths(value) / 10_000).toFixed(4)}%`;
}

export function isNearMissAchievement(value: number): boolean {
  const units = achievementTenThousandths(value);
  return (units >= 1_004_900 && units <= 1_004_999) || (units >= 999_000 && units <= 999_999);
}

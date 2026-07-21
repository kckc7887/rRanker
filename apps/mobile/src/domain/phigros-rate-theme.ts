export type PhigrosRateKind = 'f' | 'c' | 'b' | 'a' | 's' | 'v' | 'phi';

export const PHIGROS_RATE_COLORS: Record<PhigrosRateKind | 'vFc' | 'fc', { bg: string; fg: string }> = {
  f: { bg: '#F3F4F6', fg: '#6B7280' },
  c: { bg: '#F3F4F6', fg: '#6B7280' },
  b: { bg: '#F3F4F6', fg: '#6B7280' },
  a: { bg: '#F3F4F6', fg: '#6B7280' },
  s: { bg: '#FDF2F8', fg: '#DB2777' },
  v: { bg: '#4B5563', fg: '#FFFFFF' },
  vFc: { bg: '#E0F2FE', fg: '#0EA5E9' },
  fc: { bg: '#E0F2FE', fg: '#0EA5E9' },
  phi: { bg: '#FFF7E6', fg: '#B8860B' },
};

export const PHIGROS_RATE_LABELS: Record<PhigrosRateKind, string> = {
  f: 'F',
  c: 'C',
  b: 'B',
  a: 'A',
  s: 'S',
  v: 'V',
  phi: '\u03C6',
};

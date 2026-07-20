export const PHIGROS_LEVEL_COLORS: Record<number, { bg: string; fg: string }> = {
  0: { bg: '#E6F5ED', fg: '#3E9D6B' },
  1: { bg: '#E8F0FE', fg: '#3B82F6' },
  2: { bg: '#FDE8EC', fg: '#D84B68' },
  3: { bg: '#F3F4F6', fg: '#374151' },
};

export const PHIGROS_LEVEL_LABELS: Record<number, string> = {
  0: 'EZ',
  1: 'HD',
  2: 'IN',
  3: 'AT',
};

export function phigrosLevelColors(levelIndex: number): { bg: string; fg: string } {
  return PHIGROS_LEVEL_COLORS[levelIndex] ?? { bg: '#F3F4F6', fg: '#6B7280' };
}

export function phigrosLevelLabel(levelIndex: number): string {
  return PHIGROS_LEVEL_LABELS[levelIndex] ?? `LV${levelIndex}`;
}

export type MuseDashAccGradientKind = 'gold' | 'silver' | 'red';

export const MUSE_DASH_ACC_GRADIENTS: Record<MuseDashAccGradientKind, readonly [string, string, ...string[]]> = {
  gold: ['#A16207', '#F5C518', '#A16207'],
  silver: ['#64748B', '#C0C0C0', '#64748B'],
  red: ['#991B1B', '#EF4444', '#991B1B'],
};

export function museDashAccGradientKind(acc: number): MuseDashAccGradientKind | null {
  return acc >= 100 ? 'gold' : acc >= 95 ? 'silver' : acc >= 90 ? 'red' : null;
}

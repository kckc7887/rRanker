export type MaimaiFcAchievement = 'fc' | 'fcp' | 'ap' | 'app';
export type MaimaiFsAchievement = 'sync' | 'fs' | 'fsp' | 'fsd' | 'fsdp';
export type MaimaiAchievementStatus =
  | { family: 'fc'; value: MaimaiFcAchievement }
  | { family: 'fs'; value: MaimaiFsAchievement }
  | null;

export const MAIMAI_FC_ACHIEVEMENTS: readonly { value: MaimaiFcAchievement; label: string }[] = [
  { value: 'app', label: 'AP+' }, { value: 'ap', label: 'AP' },
  { value: 'fcp', label: 'FC+' }, { value: 'fc', label: 'FC' },
];

export const MAIMAI_FS_ACHIEVEMENTS: readonly { value: MaimaiFsAchievement; label: string }[] = [
  { value: 'fsdp', label: 'FDX+' }, { value: 'fsd', label: 'FDX' },
  { value: 'fsp', label: 'FS+' }, { value: 'fs', label: 'FS' },
  { value: 'sync', label: 'SYNC' },
];

/** 1-based ranks so SYNC/FC (lowest tier) are never falsy as `0`. */
const FC_RANK: Record<MaimaiFcAchievement, number> = { fc: 1, fcp: 2, ap: 3, app: 4 };
const FS_RANK: Record<MaimaiFsAchievement, number> = { sync: 1, fs: 2, fsp: 3, fsd: 4, fsdp: 5 };

export function parseConstantBound(input: string): number | undefined {
  const text = input.trim();
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function matchesConstantRange(constant: number, minInput: string, maxInput: string): boolean {
  const min = parseConstantBound(minInput);
  const max = parseConstantBound(maxInput);
  if (min !== undefined && constant < min) return false;
  if (max !== undefined && constant > max) return false;
  return true;
}

export function parseAchievementBound(input: string): number | undefined {
  const text = input.trim();
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= 101 ? value : undefined;
}

export function matchesAchievementRange(achievement: number, minInput: string, maxInput: string): boolean {
  const min = parseAchievementBound(minInput);
  const max = parseAchievementBound(maxInput);
  if (min !== undefined && max !== undefined && min > max) return false;
  if (min !== undefined && achievement < min) return false;
  if (max !== undefined && achievement > max) return false;
  return true;
}

export function normalizeMaimaiFc(value: string | null | undefined): MaimaiFcAchievement | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'fc' || normalized === 'fcp' || normalized === 'ap' || normalized === 'app') {
    return normalized;
  }
  return null;
}

export function normalizeMaimaiFs(value: string | null | undefined): MaimaiFsAchievement | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'fdx') return 'fsd';
  if (normalized === 'fdxp') return 'fsdp';
  if (normalized === 'sync' || normalized === 'fs' || normalized === 'fsp'
    || normalized === 'fsd' || normalized === 'fsdp') {
    return normalized;
  }
  return null;
}

export function matchesAchievementStatus(
  record: { fc?: string | null; fs?: string | null; rawFc?: string; rawFs?: string },
  filter: MaimaiAchievementStatus,
  strict = false,
): boolean {
  if (!filter) return true;
  if (filter.family === 'fc') {
    const actual = normalizeMaimaiFc(record.fc) ?? normalizeMaimaiFc(record.rawFc);
    if (actual === null) return false;
    return strict ? actual === filter.value : FC_RANK[actual] >= FC_RANK[filter.value];
  }
  const actual = normalizeMaimaiFs(record.fs) ?? normalizeMaimaiFs(record.rawFs);
  if (actual === null) return false;
  return strict ? actual === filter.value : FS_RANK[actual] >= FS_RANK[filter.value];
}

export function maimaiAchievementStatusLabel(filter: MaimaiAchievementStatus): string {
  if (!filter) return '全部';
  const options = filter.family === 'fc' ? MAIMAI_FC_ACHIEVEMENTS : MAIMAI_FS_ACHIEVEMENTS;
  return options.find((item) => item.value === filter.value)?.label ?? '全部';
}

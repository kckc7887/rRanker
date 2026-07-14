import type { Plate, PlateRequirement, ScoreRecord } from './models';
import { normalizeSongId } from './catalog';

const RATE = ['d', 'c', 'b', 'bb', 'bbb', 'a', 'aa', 'aaa', 's', 'sp', 'ss', 'ssp', 'sss', 'sssp'];
const FC = ['fc', 'fcp', 'ap', 'app'];
const FS = ['fs', 'fsp', 'fsd', 'fsdp', 'fdx', 'fdxp'];
/** 版本牌子达成档位；匹配时优先更长后缀（如舞舞）。 */
export const PLATE_SUFFIX_ORDER = ['極', '将', '神', '舞舞'] as const;
export type PlateSuffix = (typeof PLATE_SUFFIX_ORDER)[number];

function meets(value: string | null, required: string | null | undefined, order: string[]): boolean {
  if (!required) return true;
  if (!value) return false;
  const actual = order.indexOf(value.toLowerCase());
  const minimum = order.indexOf(required.toLowerCase());
  return minimum >= 0 && actual >= minimum;
}
export function recordMeetsRequirement(record: ScoreRecord, requirement: PlateRequirement): boolean {
  return (requirement.difficulties.length === 0 || requirement.difficulties.includes(record.levelIndex)) &&
    conditionMeets(record, requirement);
}

function conditionMeets(record: ScoreRecord, requirement: PlateRequirement): boolean {
  return meets(record.rate, requirement.rate, RATE)
    && meets(record.fc, requirement.fc, FC)
    && meets(record.fs, requirement.fs, FS);
}

function typeMatches(record: ScoreRecord, requirement: PlateRequirement, songId: string): boolean {
  return !requirement.songTypes?.[songId] || record.type === requirement.songTypes[songId];
}

/** 返回该曲尚未满足的难度序号（-1 表示任意难度要求未完成）。 */
export function unmetDifficultiesForSong(
  requirements: readonly PlateRequirement[],
  songRecords: readonly ScoreRecord[],
  songId: string,
): number[] {
  const unmet = new Set<number>();
  for (const requirement of requirements) {
    const matches = songRecords.filter((record) => typeMatches(record, requirement, songId));
    if (requirement.difficulties.length === 0) {
      if (!matches.some((record) => conditionMeets(record, requirement))) unmet.add(-1);
      continue;
    }
    for (const difficulty of requirement.difficulties) {
      const ok = matches.some((record) =>
        record.levelIndex === difficulty && conditionMeets(record, requirement));
      if (!ok) unmet.add(difficulty);
    }
  }
  return [...unmet].sort((left, right) => left - right);
}

export interface MissingSongProgress {
  songId: string;
  missingDifficulties: number[];
}

export interface PlateProgress {
  /** 要求谱面总数（按难度逐项计）。 */
  total: number;
  /** 已完成谱面数。 */
  completed: number;
  completedSongIds: string[];
  missingSongIds: string[];
  missingSongs: MissingSongProgress[];
  byDifficulty: Record<number, { total: number; completed: number }>;
}

export function calculatePlateProgress(plate: Plate, records: readonly ScoreRecord[]): PlateProgress {
  const requirementsBySong = new Map<string, PlateRequirement[]>();
  plate.requirements.forEach((requirement) => requirement.songs.forEach((songId) => {
    const id = normalizeSongId(songId);
    requirementsBySong.set(id, [...(requirementsBySong.get(id) ?? []), requirement]);
  }));
  const completedSongIds: string[] = [];
  const missingSongs: MissingSongProgress[] = [];
  const byDifficulty: Record<number, { total: number; completed: number }> = {};

  requirementsBySong.forEach((requirements, songId) => {
    const songRecords = records.filter((record) => normalizeSongId(record.songId) === songId);
    const unmet = unmetDifficultiesForSong(requirements, songRecords, songId);
    const requiredDifficulties = new Set(requirements.flatMap((item) =>
      item.difficulties.length ? item.difficulties : [-1]));
    if (unmet.length === 0) completedSongIds.push(songId);
    else missingSongs.push({ songId, missingDifficulties: unmet });
    requiredDifficulties.forEach((difficulty) => {
      byDifficulty[difficulty] ??= { total: 0, completed: 0 };
      byDifficulty[difficulty].total += 1;
      if (!unmet.includes(difficulty)) byDifficulty[difficulty].completed += 1;
    });
  });

  const chartTotals = Object.values(byDifficulty);
  return {
    total: chartTotals.reduce((sum, item) => sum + item.total, 0),
    completed: chartTotals.reduce((sum, item) => sum + item.completed, 0),
    completedSongIds,
    missingSongIds: missingSongs.map((item) => item.songId),
    missingSongs,
    byDifficulty,
  };
}

export type PlateTierLabel = '覇者' | PlateSuffix;
const MAI_PREFIX = '舞';
const HASHA_LABEL = '覇者' as const;
/** 舞代：覇者排在極前，其后仍为極/将/神/舞舞。 */
const MAI_TIER_ORDER: readonly PlateTierLabel[] = [HASHA_LABEL, ...PLATE_SUFFIX_ORDER];

export function parseVersionPlateName(name: string): { prefix: string; label: PlateTierLabel } | null {
  if (name === HASHA_LABEL) return { prefix: MAI_PREFIX, label: HASHA_LABEL };
  for (const suffix of ['舞舞', '極', '将', '神'] as const) {
    if (name.endsWith(suffix) && name.length > suffix.length) {
      return { prefix: name.slice(0, -suffix.length), label: suffix };
    }
  }
  return null;
}

/** 进度卡说明：档位对应的达成标签与后缀文案。 */
export function plateRequirementSpec(label: PlateTierLabel): {
  rate?: string;
  fc?: string;
  fs?: string;
  suffix: '评价' | '评级';
} {
  switch (label) {
    case '極': return { fc: 'fc', suffix: '评价' };
    case '将': return { rate: 'sss', suffix: '评级' };
    case '神': return { fc: 'ap', suffix: '评价' };
    case '舞舞': return { fs: 'fsd', suffix: '评价' };
    case '覇者': return { rate: 'a', suffix: '评级' };
  }
}

export interface VersionPlateEntry {
  label: PlateTierLabel;
  plate: Plate;
}

export interface VersionPlateGroup {
  prefix: string;
  entries: VersionPlateEntry[];
}

function tierOrderForPrefix(prefix: string): readonly PlateTierLabel[] {
  return prefix === MAI_PREFIX ? MAI_TIER_ORDER : PLATE_SUFFIX_ORDER;
}

/** 仅保留版本牌子（前缀 + 極/将/神/舞舞；覇者归入舞代并排在極前），丢弃其它姓名框。 */
export function groupPlatesForPicker(plates: readonly Plate[]): VersionPlateGroup[] {
  const versionMap = new Map<string, Map<PlateTierLabel, Plate>>();
  const versionOrder: string[] = [];

  for (const plate of plates) {
    const parsed = parseVersionPlateName(plate.name);
    if (!parsed) continue;
    let byLabel = versionMap.get(parsed.prefix);
    if (!byLabel) {
      byLabel = new Map();
      versionMap.set(parsed.prefix, byLabel);
      versionOrder.push(parsed.prefix);
    }
    byLabel.set(parsed.label, plate);
  }

  return versionOrder
    .map((prefix) => {
      const byLabel = versionMap.get(prefix)!;
      return {
        prefix,
        entries: tierOrderForPrefix(prefix).flatMap((label) => {
          const plate = byLabel.get(label);
          return plate ? [{ label, plate }] : [];
        }),
      };
    })
    .sort((a, b) => Math.min(...a.entries.map((e) => e.plate.id)) - Math.min(...b.entries.map((e) => e.plate.id)));
}

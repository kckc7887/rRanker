import type { Plate, PlateRequirement, ScoreRecord } from './models';
import { normalizeSongId } from './catalog';

const RATE = ['d', 'c', 'b', 'bb', 'bbb', 'a', 'aa', 'aaa', 's', 'sp', 'ss', 'ssp', 'sss', 'sssp'];
const FC = ['fc', 'fcp', 'ap', 'app'];
const FS = ['fs', 'fsp', 'fsd', 'fsdp', 'fdx', 'fdxp'];
function meets(value: string | null, required: string | null | undefined, order: string[]): boolean {
  if (!required) return true;
  if (!value) return false;
  const actual = order.indexOf(value.toLowerCase());
  const minimum = order.indexOf(required.toLowerCase());
  return minimum >= 0 && actual >= minimum;
}
export function recordMeetsRequirement(record: ScoreRecord, requirement: PlateRequirement): boolean {
  return (requirement.difficulties.length === 0 || requirement.difficulties.includes(record.levelIndex)) &&
    meets(record.rate, requirement.rate, RATE) && meets(record.fc, requirement.fc, FC) && meets(record.fs, requirement.fs, FS);
}
export interface PlateProgress { total: number; completed: number; completedSongIds: string[]; missingSongIds: string[]; byDifficulty: Record<number, { total: number; completed: number }> }
export function calculatePlateProgress(plate: Plate, records: readonly ScoreRecord[]): PlateProgress {
  const requirementsBySong = new Map<string, PlateRequirement[]>();
  plate.requirements.forEach((requirement) => requirement.songs.forEach((songId) => {
    const id = normalizeSongId(songId); requirementsBySong.set(id, [...(requirementsBySong.get(id) ?? []), requirement]);
  }));
  const completedSongIds: string[] = [];
  const missingSongIds: string[] = [];
  const byDifficulty: Record<number, { total: number; completed: number }> = {};
  requirementsBySong.forEach((requirements, songId) => {
    const songRecords = records.filter((record) => normalizeSongId(record.songId) === songId);
    const complete = requirements.every((requirement) => songRecords.some((record) =>
      (!requirement.songTypes?.[songId] || record.type === requirement.songTypes[songId]) &&
      recordMeetsRequirement(record, requirement)));
    (complete ? completedSongIds : missingSongIds).push(songId);
    new Set(requirements.flatMap((item) => item.difficulties.length ? item.difficulties : [-1])).forEach((difficulty) => {
      byDifficulty[difficulty] ??= { total: 0, completed: 0 }; byDifficulty[difficulty].total += 1;
      if (complete) byDifficulty[difficulty].completed += 1;
    });
  });
  return { total: requirementsBySong.size, completed: completedSongIds.length, completedSongIds, missingSongIds, byDifficulty };
}

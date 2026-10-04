import type { ChartType, ScoreRecord } from '@/domain/models';
import type { DivingFishUploadRecord } from '@/services/score-hub-sync-map';
import { normalizeMaimaiFc, normalizeMaimaiFs } from '@/domain/maimai-filters';

type VisibilityUploadRecord = Omit<DivingFishUploadRecord, 'type'> & { type: ChartType };

function recordKey(input: { title: string; type: ChartType; levelIndex: number }): string {
  return `${input.type}\u0000${input.levelIndex}\u0000${input.title}`;
}

export function uploadedRecordsAreVisible(
  actualRecords: readonly Pick<ScoreRecord, 'title' | 'type' | 'levelIndex' | 'achievements' | 'dxScore' | 'fc' | 'fs' | 'rawFc' | 'rawFs'>[],
  uploadedRecords: readonly VisibilityUploadRecord[],
  comparison: 'at-least' | 'exact' = 'at-least',
): boolean {
  const counts = new Map<string, number>();
  for (const record of actualRecords) counts.set(recordKey(record), (counts.get(recordKey(record)) ?? 0) + 1);
  const actualByChart = new Map(
    actualRecords.map((record) => [recordKey(record), record] as const),
  );
  return uploadedRecords.every((uploaded) => {
    const actual = actualByChart.get(recordKey({
      title: uploaded.title,
      type: uploaded.type,
      levelIndex: uploaded.level_index,
    }));
    if (!actual) return false;
    if (comparison === 'at-least') return actual.achievements + 0.0001 >= uploaded.achievements;
    const fc = normalizeMaimaiFc(uploaded.fc), fs = normalizeMaimaiFs(uploaded.fs);
    return counts.get(recordKey(actual)) === 1
      && actual.achievements === uploaded.achievements
      && (uploaded.dxScore === null || actual.dxScore === uploaded.dxScore)
      && !actual.rawFc && !actual.rawFs
      && (!uploaded.fc || fc !== null) && (!uploaded.fs || fs !== null)
      && actual.fc === fc && actual.fs === fs;
  });
}

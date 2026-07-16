import type { ScoreRecord } from '@/domain/models';
import type { DivingFishUploadRecord } from '@/services/score-hub-sync-map';

function recordKey(input: { title: string; type: 'SD' | 'DX'; levelIndex: number }): string {
  return `${input.type}\u0000${input.levelIndex}\u0000${input.title}`;
}

/** 水鱼读取结果至少包含刚上传的达成率；更高的历史最佳成绩同样视为已同步。 */
export function uploadedRecordsAreVisible(
  actualRecords: readonly ScoreRecord[],
  uploadedRecords: readonly DivingFishUploadRecord[],
): boolean {
  const actualByChart = new Map(
    actualRecords.map((record) => [recordKey(record), record] as const),
  );
  return uploadedRecords.every((uploaded) => {
    const actual = actualByChart.get(recordKey({
      title: uploaded.title,
      type: uploaded.type,
      levelIndex: uploaded.level_index,
    }));
    return !!actual && actual.achievements + 0.0001 >= uploaded.achievements;
  });
}

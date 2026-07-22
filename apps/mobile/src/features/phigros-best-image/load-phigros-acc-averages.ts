import type { ScoreRecord } from '@/domain/models';

const PHI_PLUGIN_API = 'https://phib19.top:8080';
const LEVELS = ['EZ', 'HD', 'IN', 'AT'] as const;

export type PhigrosAccAverageKind = 'Lower' | 'Higher' | 'Hyper' | 'Finished';
export type PhigrosAccAverage = { value: number; kind: PhigrosAccAverageKind };

type AverageResponse = Record<string, Record<string, { accAvg?: number | null } | undefined> | undefined>;

export function phigrosAccAverageKey(record: Pick<ScoreRecord, 'songId' | 'levelIndex'>): string {
  return `${record.songId}:${record.levelIndex}`;
}

function apiSongId(songId: string): string {
  return songId.endsWith('.0') ? songId : `${songId}.0`;
}

async function requestAverages(
  records: readonly ScoreRecord[],
  minRks: number,
  maxRks: number,
): Promise<AverageResponse> {
  const songIds = [...new Set(records.map((record) => apiSongId(record.songId)))];
  if (!songIds.length) return {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${PHI_PLUGIN_API}/get/scoreList/allAccAvg`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songIds, minRks, maxRks }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`平均 ACC 接口返回 HTTP ${response.status}`);
    const json = await response.json() as { data?: AverageResponse; error?: unknown };
    if (json.error || !json.data) throw new Error('平均 ACC 接口返回无效数据');
    return json.data;
  } finally {
    clearTimeout(timeout);
  }
}

function averageFor(response: AverageResponse, record: ScoreRecord): number | null {
  const level = LEVELS[record.levelIndex];
  if (!level) return null;
  const value = response[apiSongId(record.songId)]?.[level]?.accAvg;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * 对齐 phi-plugin Save.getB19 的 Avg 逻辑：先比较同 RKS 区间；若 B27 全部高于
 * 该区间均值，再提升两个 0.05 RKS 档位并切换为 Hyper / Finished 配色。
 */
export async function loadPhigrosAccAverages(
  records: readonly ScoreRecord[],
  playerRks: number,
): Promise<Record<string, PhigrosAccAverage>> {
  if (!records.length || !Number.isFinite(playerRks)) return {};
  try {
    const baseMin = Math.floor((playerRks - 0.05) / 0.05) * 0.05;
    const baseMax = Math.floor((playerRks + 0.05) / 0.05) * 0.05;
    const first = await requestAverages(records, baseMin, baseMax);
    const result: Record<string, PhigrosAccAverage> = {};
    let allHigher = true;
    for (const [index, record] of records.entries()) {
      if (index >= 27 && allHigher) break;
      const value = averageFor(first, record);
      if (value == null) continue;
      const kind = record.achievements < value ? 'Lower' : 'Higher';
      if (kind === 'Lower') allHigher = false;
      result[phigrosAccAverageKey(record)] = { value, kind };
    }
    if (!allHigher) return result;

    const higherMin = (Math.floor((playerRks - 0.05) / 0.05) + 2) * 0.05;
    const higherMax = (Math.ceil((playerRks + 0.05) / 0.05) + 2) * 0.05;
    const second = await requestAverages(records, higherMin, higherMax);
    const elevated: Record<string, PhigrosAccAverage> = {};
    for (const record of records) {
      const value = averageFor(second, record);
      if (value == null) continue;
      elevated[phigrosAccAverageKey(record)] = {
        value,
        kind: record.achievements < value ? 'Hyper' : 'Finished',
      };
    }
    return elevated;
  } catch {
    return {};
  }
}

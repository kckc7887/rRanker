import type { ScoreRecord } from '@/domain/models';
import { providerErrorFromStatus } from '@/providers/errors';
import { requestJson } from '@/providers/http-json';
import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';

const PHI_PLUGIN_API = 'https://phib19.top:8080';
const LEVELS = ['EZ', 'HD', 'IN', 'AT'] as const;

export type PhigrosAccAverageKind = 'Lower' | 'Higher' | 'Hyper' | 'Finished';
export type PhigrosAccAverage = { value: number; kind: PhigrosAccAverageKind };

const averagesSchema = z.record(z.string(), z.record(z.string(), z.object({ accAvg: z.number().min(0).max(100).nullish() })));
const responseSchema = z.object({ data: averagesSchema, error: z.unknown().optional() }).refine(value => !value.error);
type AverageResponse = z.infer<typeof averagesSchema>;

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
  signal?: AbortSignal,
): Promise<AverageResponse> {
  const songIds = [...new Set(records.map((record) => apiSongId(record.songId)))];
  if (!songIds.length) return {};
  if (signal?.aborted) return {};
  const response = await requestJson({
    baseUrl: PHI_PLUGIN_API, path: '/get/scoreList/allAccAvg', schema: responseSchema,
    fetcher: expoFetch as unknown as typeof fetch, label: '平均 ACC', signal, timeoutMs: 10_000, totalAttempts: 1,
    init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ songIds, minRks, maxRks }) },
    error: status => providerErrorFromStatus(status, {
      rateLimit: '平均 ACC 查询过于频繁', server: '平均 ACC 服务暂时不可用',
      fallback: { code: 'network', message: status => `平均 ACC 接口返回 HTTP ${status}` },
    }),
  });
  return response.data;
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
  signal?: AbortSignal,
): Promise<Record<string, PhigrosAccAverage>> {
  if (!records.length || !Number.isFinite(playerRks)) return {};
  try {
    const baseMin = Math.floor((playerRks - 0.05) / 0.05) * 0.05;
    const baseMax = Math.floor((playerRks + 0.05) / 0.05) * 0.05;
    const first = await requestAverages(records, baseMin, baseMax, signal);
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
    const second = await requestAverages(records, higherMin, higherMax, signal);
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

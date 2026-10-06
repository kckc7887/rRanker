import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type { ChartType } from '@/domain/models';
import { maimaiChartPreviewChartId } from '@/domain/maimai-chart-preview';
import { ProviderError, providerErrorFromStatus, type ProviderStatusTexts } from '@/providers/errors';
import { requestJson } from '@/providers/http-json';

export const MAIMAI_DXTAG_BASE_URL = 'https://rranker-maimai-data.cn-nb1.rains3.com';
export const MAIMAI_DXTAG_AXES = ['键盘', '星星', '技巧', '体力', '爆发'] as const;

const score = z.number().finite().gte(0).lte(10);
const rowSchema = z.object({
  difficulty: z.number().int().gte(0).lte(4),
  scores: z.tuple([score, score, score, score, score]),
}).passthrough();
export const maimaiDxTagChartsSchema = z.array(rowSchema).min(1);

export type MaimaiDxTagScores = readonly [number, number, number, number, number];
export type MaimaiDxTagChart = { difficulty: number; scores: MaimaiDxTagScores };

const DXTAG_STATUS_TEXTS: ProviderStatusTexts = {
  noData: 'DXTag 对象不存在',
  rateLimit: 'DXTag 请求过于频繁，请稍后重试',
  server: 'DXTag 暂时不可用',
  fallback: { message: (status) => `DXTag 返回 HTTP ${status}`, code: 'network' },
};

export function maimaiDxTagChartId(songId: string, chartType: ChartType): number | null {
  if (chartType === 'UTAGE') return null;
  return maimaiChartPreviewChartId(songId, chartType);
}

export function maimaiDxTagScoresForDifficulty(
  charts: readonly MaimaiDxTagChart[],
  levelIndex: number,
): MaimaiDxTagScores | null {
  const [only, extra] = charts.filter((chart) => chart.difficulty === levelIndex);
  return only && !extra ? only.scores : null;
}

export async function loadMaimaiDxTag(chartId: number, signal?: AbortSignal): Promise<readonly MaimaiDxTagChart[] | null> {
  try {
    const rows = await requestJson({
      baseUrl: MAIMAI_DXTAG_BASE_URL,
      path: `/DXTag/${chartId}.json`,
      schema: maimaiDxTagChartsSchema,
      fetcher: expoFetch as unknown as typeof fetch,
      signal,
      label: 'DXTag',
      timeoutMs: 12_000,
      totalAttempts: 1,
      diagnosticScenario: 'metadata',
      error: (status) => providerErrorFromStatus(status, DXTAG_STATUS_TEXTS),
      messages: {
        schema: 'DXTag 响应结构与已验证契约不一致',
        timeout: 'DXTag 读取超时',
        network: '无法读取 DXTag',
      },
    });
    const seen = new Set<number>();
    for (const row of rows) {
      if (seen.has(row.difficulty)) {
        throw new ProviderError('upstream_schema', 'DXTag 响应结构与已验证契约不一致', false);
      }
      seen.add(row.difficulty);
    }
    return rows.map((row) => ({ difficulty: row.difficulty, scores: row.scores }));
  } catch (error) {
    if (error instanceof ProviderError && error.code === 'no_data') return null;
    throw error;
  }
}

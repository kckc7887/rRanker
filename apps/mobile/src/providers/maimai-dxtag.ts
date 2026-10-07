import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type { MaimaiDxTagLibrary } from '@/domain/maimai-dxtag';
import { providerErrorFromStatus, type ProviderStatusTexts } from '@/providers/errors';
import { requestJson } from '@/providers/http-json';

export const MAIMAI_DXTAG_BASE_URL = 'https://rranker-maimai-data.cn-nb1.rains3.com';

const score = z.number().finite().gte(0).lte(10);
const rowSchema = z.object({
  difficulty: z.number().int().gte(0).lte(4),
  scores: z.tuple([score, score, score, score, score]),
}).passthrough();
const chartsSchema = z.array(rowSchema).min(1).refine(
  rows => new Set(rows.map(row => row.difficulty)).size === rows.length,
);
export const maimaiDxTagLibrarySchema = z.record(z.string().regex(/^(0|[1-9]\d*)$/), chartsSchema);

const DXTAG_STATUS_TEXTS: ProviderStatusTexts = {
  noData: 'DXTag 对象不存在',
  rateLimit: 'DXTag 请求过于频繁，请稍后重试',
  server: 'DXTag 暂时不可用',
  fallback: { message: (status) => `DXTag 返回 HTTP ${status}`, code: 'network' },
};

export async function loadMaimaiDxTag(signal?: AbortSignal): Promise<MaimaiDxTagLibrary> {
  return requestJson({
    baseUrl: MAIMAI_DXTAG_BASE_URL,
    path: '/DXTag/all.json',
    schema: maimaiDxTagLibrarySchema,
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
}

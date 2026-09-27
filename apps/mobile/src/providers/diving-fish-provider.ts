import { z } from 'zod';
import { fetch as expoFetch } from 'expo/fetch';
import type { DataSource, Player } from '@/domain/models';
import { normalizeDivingFishCourseRank } from '@/domain/maimai-course-rank';
import { DivingFishRecordsResponseSchema, mapDivingFishRecord } from '@/domain/schemas';
import type { ProviderSession, ScoreProvider } from './contracts';
import { ProviderError, providerErrorFromStatus } from './errors';
import { requestJson } from './http-json';

const BASE_URL = 'https://www.diving-fish.com/api/maimaidxprober';
const ProfileSchema = z.object({
  username: z.string().optional(), nickname: z.string().optional(),
  plate: z.string().optional(),
  rating: z.number().int().nonnegative().optional(), additional_rating: z.number().int().nonnegative().optional(),
});
function parseContract<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ProviderError('upstream_schema', '水鱼响应结构与已验证契约不一致', true);
  }
  return result.data;
}

/**
 * 水鱼查分 Provider。请求统一走 http-json 公共执行器：
 * 鉴权头（Cookie / Import-Token）与 credentials 经 init 注入，超时、取消、
 * 状态码映射与解析、网络错误归一化由公共执行器负责；只读端点固定总尝试次数 1。
 */
export class DivingFishProvider implements ScoreProvider {
  private recordsRequest: Promise<z.infer<typeof DivingFishRecordsResponseSchema>> | null = null;

  constructor(private readonly session: ProviderSession) {}

  private request(path: string, signal?: AbortSignal): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.session.mode === 'jwt') headers.Cookie = `jwt_token=${this.session.value}`;
    if (this.session.mode === 'import-token') headers['Import-Token'] = this.session.value;
    const credentials = this.session.mode === 'cookie-jar' ? 'include' : 'omit';
    return requestJson({
      baseUrl: BASE_URL,
      path,
      schema: z.unknown(),
      fetcher: expoFetch as unknown as typeof fetch,
      signal,
      totalAttempts: 1,
      timeoutMs: 12_000,
      label: '水鱼',
      messages: { schema: '水鱼返回了无效 JSON', timeout: '水鱼读取超时', network: '无法连接水鱼服务' },
      init: { headers, credentials },
      error: (status) => {
        const mapped = providerErrorFromStatus(status);
        return new ProviderError(mapped.code, `${mapped.message}（${path}）`, mapped.retryable, { cause: mapped });
      },
    });
  }

  private source(): DataSource {
    return { kind: 'diving-fish', label: '水鱼查分器', updatedAt: new Date().toISOString(), isStale: false };
  }

  private getRecordsPayload(signal?: AbortSignal): Promise<z.infer<typeof DivingFishRecordsResponseSchema>> {
    if (!this.recordsRequest) {
      this.recordsRequest = this.request('/player/records', signal)
        .then((payload) => parseContract(DivingFishRecordsResponseSchema, payload));
      void this.recordsRequest.then(
        () => { this.recordsRequest = null; },
        () => { this.recordsRequest = null; },
      );
    }
    return this.recordsRequest;
  }

  async getPlayer(signal?: AbortSignal): Promise<Player> {
    if (this.session.mode === 'import-token') {
      const records = await this.getRecordsPayload(signal);
      const source = this.source();
      return {
        id: records.username ?? 'diving-fish-user',
        displayName: records.nickname ?? records.username ?? '水鱼玩家',
        rating: records.rating ?? 0,
        additionalRating: records.additional_rating,
        extension: {
          kind: 'maimai',
          courseRank: normalizeDivingFishCourseRank(records.additional_rating),
        },
        presentation: records.plate ? { trophyName: records.plate } : undefined,
        source,
      };
    }
    const profile = parseContract(ProfileSchema, await this.request('/player/profile', signal));
    const source = this.source();
    return {
      id: profile.username ?? 'diving-fish-user',
      displayName: profile.nickname ?? profile.username ?? '水鱼玩家',
      rating: profile.rating ?? 0,
      additionalRating: profile.additional_rating,
      extension: {
        kind: 'maimai',
        courseRank: normalizeDivingFishCourseRank(profile.additional_rating),
      },
      presentation: profile.plate ? { trophyName: profile.plate } : undefined,
      source,
    };
  }
  async getRecords(signal?: AbortSignal) {
    const raw = await this.getRecordsPayload(signal);
    return raw.records.map((record) => mapDivingFishRecord(record));
  }
  async getChartStats(signal?: AbortSignal) { return this.request('/chart_stats', signal); }
}

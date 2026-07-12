import { z } from 'zod';
import { fetch as expoFetch } from 'expo/fetch';
import type { DataSource, Player, Song } from '@/domain/models';
import { buildBest50 } from '@/domain/rating';
import { DivingFishRecordsResponseSchema, mapDivingFishRecord } from '@/domain/schemas';
import type { ProviderSession, ScoreProvider } from './contracts';
import { ProviderError, providerErrorFromStatus } from './errors';

const BASE_URL = 'https://www.diving-fish.com/api/maimaidxprober';
const ProfileSchema = z.object({
  username: z.string().optional(), nickname: z.string().optional(),
  rating: z.number().int().nonnegative().optional(), additional_rating: z.number().int().nonnegative().optional(),
});
const MusicDataSchema = z.array(z.object({
  id: z.union([z.number(), z.string()]), title: z.string(),
  basic_info: z.object({ artist: z.string().optional(), from: z.string() }).passthrough(),
}).passthrough());

function parseContract<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ProviderError('upstream_schema', '水鱼响应结构与已验证契约不一致', true);
  }
  return result.data;
}

export class DivingFishProvider implements ScoreProvider {
  constructor(private readonly session: ProviderSession) {}

  private async request(path: string): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.session.mode === 'jwt') headers.Cookie = `jwt_token=${this.session.value}`;
    if (this.session.mode === 'import-token') headers['Import-Token'] = this.session.value;
    const credentials = this.session.mode === 'cookie-jar' ? 'include' : 'omit';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await expoFetch(`${BASE_URL}${path}`, {
        headers, credentials, signal: controller.signal,
      });
      if (!response.ok) {
        const error = providerErrorFromStatus(response.status);
        throw new ProviderError(error.code, `${error.message}（${path}）`, error.retryable, { cause: error });
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof SyntaxError) {
        throw new ProviderError('upstream_schema', '水鱼返回了无效 JSON', true, { cause: error });
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderError('timeout', '水鱼读取超时', true, { cause: error });
      }
      throw new ProviderError('network', '无法连接水鱼服务', true, { cause: error });
    } finally { clearTimeout(timeout); }
  }

  private source(): DataSource {
    return { kind: 'diving-fish', label: '水鱼查分器', updatedAt: new Date().toISOString(), isStale: false };
  }

  async getPlayer(): Promise<Player> {
    const profile = parseContract(ProfileSchema, await this.request('/player/profile'));
    const source = this.source();
    return {
      id: profile.username ?? 'diving-fish-user',
      displayName: profile.nickname ?? profile.username ?? '水鱼玩家',
      rating: profile.rating ?? 0, additionalRating: profile.additional_rating, source,
    };
  }
  async getRecords() {
    const [payload, musicData] = await Promise.all([
      this.request('/player/records'), this.request('/music_data'),
    ]);
    const raw = parseContract(DivingFishRecordsResponseSchema, payload);
    const songs = parseContract(MusicDataSchema, musicData);
    const versions = new Map(songs.map((song) => [String(song.id), song.basic_info.from]));
    return raw.records.map((record) => mapDivingFishRecord(record, versions.get(String(record.song_id))));
  }
  async getBest50(currentVersion: string) {
    const [player, records] = await Promise.all([this.getPlayer(), this.getRecords()]);
    return buildBest50(player, records, currentVersion, this.source());
  }
  async getSongs(): Promise<Song[]> {
    const raw = parseContract(MusicDataSchema, await this.request('/music_data'));
    return raw.map((song) => ({
      id: String(song.id), title: song.title, artist: song.basic_info.artist,
      version: song.basic_info.from, charts: [],
    }));
  }
  async getChartStats() { return this.request('/chart_stats'); }
}

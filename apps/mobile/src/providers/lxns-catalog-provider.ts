import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import { chartVersionKey, difficultyFromIndex } from '@/domain/catalog';
import type { CatalogSnapshot, Chart, ChartType, DataSource, Song } from '@/domain/models';
import type { CatalogProvider } from './contracts';
import { ProviderError, providerErrorFromStatus } from './errors';

const CATALOG_URL = 'https://maimai.lxns.net/api/v0/maimai/song/list';

const VersionSchema = z.object({
  id: z.number().int(),
  title: z.string().min(1),
  version: z.number().int().positive(),
}).passthrough();

const DifficultySchema = z.object({
  type: z.enum(['standard', 'dx']),
  difficulty: z.number().int().min(0),
  level: z.string(),
  level_value: z.number().finite().nonnegative(),
  version: z.number().int().positive(),
}).passthrough();

const SongSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string(),
  artist: z.string().optional(),
  version: z.number().int().positive(),
  disabled: z.boolean().optional(),
  difficulties: z.object({
    standard: z.array(DifficultySchema).default([]),
    dx: z.array(DifficultySchema).default([]),
  }).passthrough(),
}).passthrough();

const CatalogResponseSchema = z.object({
  songs: z.array(SongSchema),
  versions: z.array(VersionSchema).min(1),
}).passthrough();

function chartType(type: 'standard' | 'dx'): ChartType {
  return type === 'dx' ? 'DX' : 'SD';
}

export class LxnsCatalogProvider implements CatalogProvider {
  async getCatalog(): Promise<CatalogSnapshot> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await expoFetch(CATALOG_URL, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw providerErrorFromStatus(response.status);

      const parsed = CatalogResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new ProviderError('upstream_schema', 'LXNS 曲库响应结构与已验证契约不一致', true);
      }

      const current = parsed.data.versions.reduce((latest, version) =>
        version.version > latest.version ? version : latest,
      );
      const versionTitles = new Map(parsed.data.versions.map((version) => [version.version, version.title]));
      const chartVersionIndex: Record<string, number> = {};
      let currentChartCount = 0;

      const songs: Song[] = parsed.data.songs.map((rawSong) => {
        const charts: Chart[] = [...rawSong.difficulties.standard, ...rawSong.difficulties.dx].map((difficulty) => {
          const type = chartType(difficulty.type);
          if (!rawSong.disabled) {
            chartVersionIndex[chartVersionKey(rawSong.id, type, difficulty.difficulty)] = difficulty.version;
            if (difficulty.version === current.version) currentChartCount += 1;
          }
          return {
            songId: String(rawSong.id),
            type,
            levelIndex: difficulty.difficulty,
            level: difficulty.level,
            difficulty: difficultyFromIndex(difficulty.difficulty),
            difficultyConstant: difficulty.level_value,
          };
        });
        return {
          id: String(rawSong.id),
          title: rawSong.title,
          artist: rawSong.artist,
          version: versionTitles.get(rawSong.version) ?? String(rawSong.version),
          charts,
        };
      });

      if (currentChartCount === 0) {
        throw new ProviderError('upstream_schema', 'LXNS 最新版本没有可用谱面，拒绝猜测 B15 版本', true);
      }

      const source: DataSource = {
        kind: 'lxns',
        label: 'LXNS 公共曲库',
        updatedAt: new Date().toISOString(),
        isStale: false,
      };
      return {
        currentVersion: { id: current.version, title: current.title },
        versions: parsed.data.versions.map((version) => ({ id: version.version, title: version.title })),
        songs,
        chartVersionIndex,
        source,
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof SyntaxError) {
        throw new ProviderError('upstream_schema', 'LXNS 返回了无效 JSON', true, { cause: error });
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderError('timeout', 'LXNS 曲库读取超时', true, { cause: error });
      }
      throw new ProviderError('network', '无法连接 LXNS 公共曲库', true, { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}

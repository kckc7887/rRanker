import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type {
  ChunithmCatalogSnapshot,
  ChunithmDifficulty,
  ChunithmLevelIndex,
} from '@/domain/chunithm';
import type { DataSource } from '@/domain/models';
import { ProviderError, providerErrorFromStatus } from './errors';

const API_ROOT = 'https://maimai.lxns.net/api/v0/chunithm';

const VersionSchema = z.object({
  id: z.number().int(),
  title: z.string().min(1),
  version: z.number().int().positive(),
}).passthrough();

const GenreSchema = z.object({
  id: z.number().int(),
  genre: z.string().min(1),
}).passthrough();

const DifficultySchema = z.object({
  difficulty: z.number().int().min(0).max(5),
  level: z.string().min(1),
  level_value: z.number().finite().nonnegative(),
  note_designer: z.string().nullish(),
  version: z.number().int().positive(),
}).passthrough();

const SongSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().min(1),
  artist: z.string().nullish(),
  genre: z.string().default('未分类'),
  bpm: z.number().finite().nonnegative().default(0),
  map: z.string().nullish(),
  rights: z.string().nullish(),
  version: z.number().int().positive(),
  locked: z.boolean().optional(),
  disabled: z.boolean().optional(),
  difficulties: z.array(DifficultySchema),
}).passthrough();

const CatalogResponseSchema = z.object({
  songs: z.array(SongSchema),
  genres: z.array(GenreSchema),
  versions: z.array(VersionSchema).min(1),
}).passthrough();

type RawVersion = z.infer<typeof VersionSchema>;

function source(): DataSource {
  return {
    kind: 'lxns',
    label: 'LXNS 中二节奏公共曲库',
    updatedAt: new Date().toISOString(),
    isStale: false,
  };
}

function versionAtOrBefore(
  versions: readonly RawVersion[],
  rawVersion: number,
): RawVersion | undefined {
  return versions.reduce<RawVersion | undefined>(
    (matched, item) => (
      item.version <= rawVersion && (!matched || item.version > matched.version)
        ? item
        : matched
    ),
    undefined,
  );
}

async function getJson(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await expoFetch(`${API_ROOT}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw providerErrorFromStatus(response.status);
    return await response.json();
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof SyntaxError) {
      throw new ProviderError(
        'upstream_schema',
        'LXNS 中二曲库返回了无效 JSON',
        true,
        { cause: error },
      );
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError(
        'timeout',
        'LXNS 中二曲库读取超时',
        true,
        { cause: error },
      );
    }
    throw new ProviderError(
      'network',
      '无法连接 LXNS 中二曲库',
      true,
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function mapChunithmCatalog(input: unknown): ChunithmCatalogSnapshot {
  const parsed = CatalogResponseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProviderError(
      'upstream_schema',
      'LXNS 中二曲库响应结构与已验证契约不一致',
      true,
    );
  }

  const current = parsed.data.versions.reduce(
    (latest, item) => item.version > latest.version ? item : latest,
  );
  const versions = parsed.data.versions.map((item) => ({
    id: item.version,
    title: item.title,
  }));

  return {
    currentVersion: { id: current.version, title: current.title },
    versions,
    genres: parsed.data.genres.map((item) => ({ id: item.id, title: item.genre })),
    songs: parsed.data.songs.flatMap((song) => {
      const songVersion = versionAtOrBefore(parsed.data.versions, song.version);
      const difficulties = song.difficulties
        .filter((difficulty) => difficulty.difficulty <= 4)
        .map((difficulty): ChunithmDifficulty => {
          const chartVersion = versionAtOrBefore(parsed.data.versions, difficulty.version);
          return {
            difficulty: difficulty.difficulty as ChunithmLevelIndex,
            level: difficulty.level,
            levelValue: difficulty.level_value,
            noteDesigner: difficulty.note_designer ?? undefined,
            versionId: chartVersion?.version ?? difficulty.version,
            versionTitle: chartVersion?.title ?? String(difficulty.version),
          };
        });
      if (difficulties.length === 0) return [];
      return [{
        id: song.id,
        title: song.title,
        artist: song.artist ?? undefined,
        genre: song.genre,
        bpm: song.bpm,
        map: song.map?.trim() || undefined,
        rights: song.rights?.trim() || undefined,
        versionId: songVersion?.version ?? song.version,
        versionTitle: songVersion?.title ?? String(song.version),
        locked: song.locked ?? false,
        disabled: song.disabled ?? false,
        difficulties,
      }];
    }),
    source: source(),
  };
}

export class ChunithmCatalogProvider {
  async getCatalog(): Promise<ChunithmCatalogSnapshot> {
    return mapChunithmCatalog(await getJson('/song/list'));
  }
}

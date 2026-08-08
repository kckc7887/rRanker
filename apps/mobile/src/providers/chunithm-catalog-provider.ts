import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type {
  ChunithmAliasSnapshot,
  ChunithmCatalogSnapshot,
  ChunithmDifficulty,
  ChunithmLevelIndex,
  ChunithmSong,
  ChunithmSongDetailSnapshot,
} from '@/domain/chunithm';
import type {
  ChunithmCollection,
  ChunithmCollectionKind,
  ChunithmCollectionListSnapshot,
  ChunithmCollectionRequired,
  ChunithmCollectionRequiredSong,
} from '@/domain/chunithm-collections';
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

const NotesSchema = z.object({
  total: z.number().int().nonnegative(),
  tap: z.number().int().nonnegative(),
  hold: z.number().int().nonnegative(),
  slide: z.number().int().nonnegative(),
  air: z.number().int().nonnegative(),
  flick: z.number().int().nonnegative(),
}).passthrough();

const DifficultySchema = z.object({
  difficulty: z.number().int().min(0).max(5),
  level: z.string().min(1),
  level_value: z.number().finite().nonnegative(),
  note_designer: z.string().nullish(),
  version: z.number().int().positive(),
  origin_id: z.number().int().nonnegative().nullish(),
  kanji: z.string().nullish(),
  star: z.number().int().nonnegative().nullish(),
  notes: NotesSchema.nullish(),
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

const AliasEntrySchema = z.object({
  song_id: z.number().int().nonnegative(),
  aliases: z.array(z.string()),
}).passthrough();

const AliasResponseSchema = z.union([
  z.array(AliasEntrySchema),
  z.object({ aliases: z.array(AliasEntrySchema) }).passthrough(),
]);

const CollectionRequiredSongSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().default(''),
  completed: z.boolean().optional(),
  completed_difficulties: z.array(z.number().int().nonnegative()).optional(),
}).passthrough();

const CollectionRequiredSchema = z.object({
  difficulties: z.array(z.number().int().nonnegative()).default([]),
  rank: z.string().optional(),
  full_combo: z.string().optional(),
  full_chain: z.string().optional(),
  clear: z.string().optional(),
  songs: z.array(CollectionRequiredSongSchema).default([]),
  completed: z.boolean().optional(),
}).passthrough();

const CollectionSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().default(''),
  description: z.string().optional(),
  color: z.string().optional(),
  level: z.number().int().nonnegative().optional(),
  required: z.array(CollectionRequiredSchema).optional(),
}).passthrough();

const CollectionEnvelopeSchema = z.object({
  trophies: z.array(CollectionSchema).optional(),
  characters: z.array(CollectionSchema).optional(),
  plates: z.array(CollectionSchema).optional(),
  icons: z.array(CollectionSchema).optional(),
}).passthrough();

const CollectionListResponseSchema = z.union([
  z.array(CollectionSchema),
  CollectionEnvelopeSchema,
]);

type RawVersion = z.infer<typeof VersionSchema>;

function source(): DataSource {
  return {
    kind: 'lxns',
    label: 'LXNS 中二节奏公共曲库',
    updatedAt: new Date().toISOString(),
    isStale: false,
  };
}

function detailSource(): DataSource {
  return {
    kind: 'lxns',
    label: 'LXNS 中二节奏单曲详情',
    updatedAt: new Date().toISOString(),
    isStale: false,
  };
}

function aliasSource(): DataSource {
  return {
    kind: 'lxns',
    label: 'LXNS 中二别名库',
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

function mapDifficulty(
  difficulty: z.infer<typeof DifficultySchema>,
  versions: readonly RawVersion[],
): ChunithmDifficulty {
  const chartVersion = versionAtOrBefore(versions, difficulty.version);
  return {
    difficulty: difficulty.difficulty as ChunithmLevelIndex,
    level: difficulty.level,
    levelValue: difficulty.level_value,
    noteDesigner: difficulty.note_designer ?? undefined,
    versionId: chartVersion?.version ?? difficulty.version,
    versionTitle: chartVersion?.title ?? String(difficulty.version),
    originId: difficulty.origin_id ?? undefined,
    kanji: difficulty.kanji?.trim() || undefined,
    star: difficulty.star ?? undefined,
    notes: difficulty.notes
      ? {
          total: difficulty.notes.total,
          tap: difficulty.notes.tap,
          hold: difficulty.notes.hold,
          slide: difficulty.notes.slide,
          air: difficulty.notes.air,
          flick: difficulty.notes.flick,
        }
      : undefined,
  };
}

function mapSong(
  song: z.infer<typeof SongSchema>,
  versions: readonly RawVersion[],
): ChunithmSong | null {
  const songVersion = versionAtOrBefore(versions, song.version);
  const difficulties = song.difficulties.map((difficulty) => mapDifficulty(difficulty, versions));
  if (difficulties.length === 0) return null;
  return {
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
  };
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
      const mapped = mapSong(song, parsed.data.versions);
      return mapped ? [mapped] : [];
    }),
    source: source(),
  };
}

export function mapChunithmSongDetail(input: unknown): ChunithmSongDetailSnapshot {
  const parsed = SongSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProviderError(
      'upstream_schema',
      'LXNS 中二单曲详情响应结构与已验证契约不一致',
      true,
    );
  }
  const song = mapSong(parsed.data, []);
  if (!song) {
    throw new ProviderError('upstream_schema', 'LXNS 中二单曲详情没有可用谱面', true);
  }
  return { song, source: detailSource() };
}

export function mapChunithmAliases(input: unknown): ChunithmAliasSnapshot {
  const parsed = AliasResponseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProviderError(
      'upstream_schema',
      'LXNS 中二别名响应结构与已验证契约不一致',
      true,
    );
  }
  const entries = Array.isArray(parsed.data) ? parsed.data : parsed.data.aliases;
  return {
    aliases: entries.map((item) => ({
      songId: String(item.song_id),
      aliases: item.aliases,
    })),
    source: aliasSource(),
  };
}

function mapCollectionRequiredSong(
  song: z.infer<typeof CollectionRequiredSongSchema>,
): ChunithmCollectionRequiredSong {
  return {
    id: song.id,
    title: song.title,
  };
}

function mapCollectionRequired(
  required: z.infer<typeof CollectionRequiredSchema>,
): ChunithmCollectionRequired {
  return {
    difficulties: required.difficulties,
    rank: required.rank as ChunithmCollectionRequired['rank'],
    fullCombo: required.full_combo as ChunithmCollectionRequired['fullCombo'],
    fullChain: required.full_chain as ChunithmCollectionRequired['fullChain'],
    clear: required.clear,
    songs: required.songs.map(mapCollectionRequiredSong),
  };
}

function mapCollection(collection: z.infer<typeof CollectionSchema>): ChunithmCollection {
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    color: collection.color,
    level: collection.level,
    required: collection.required?.map(mapCollectionRequired),
  };
}

function collectionEntries(
  kind: ChunithmCollectionKind,
  payload: z.infer<typeof CollectionListResponseSchema>,
): z.infer<typeof CollectionSchema>[] {
  if (Array.isArray(payload)) return payload;
  switch (kind) {
    case 'trophy': return payload.trophies ?? [];
    case 'character': return payload.characters ?? [];
    case 'plate': return payload.plates ?? [];
    case 'icon': return payload.icons ?? [];
  }
}

function collectionSource(): DataSource {
  return {
    kind: 'lxns',
    label: 'LXNS 中二收藏品列表',
    updatedAt: new Date().toISOString(),
    isStale: false,
  };
}

/**
 * 中二收藏品四类列表。注意：中二公共 API 的列表响应不携带达成条件（required），
 * 条件与完成状态需通过个人 API（/user/chunithm/player/{type}/{id}）逐件获取。
 */
export function mapChunithmCollections(
  kind: ChunithmCollectionKind,
  input: unknown,
): ChunithmCollectionListSnapshot {
  const parsed = CollectionListResponseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProviderError(
      'upstream_schema',
      `LXNS 中二 ${kind} 收藏品响应结构与已验证契约不一致`,
      true,
    );
  }
  return {
    items: collectionEntries(kind, parsed.data).map(mapCollection),
    source: collectionSource(),
  };
}

export class ChunithmCatalogProvider {
  async getCatalog(): Promise<ChunithmCatalogSnapshot> {
    return mapChunithmCatalog(await getJson('/song/list'));
  }

  async getAliases(): Promise<ChunithmAliasSnapshot> {
    return mapChunithmAliases(await getJson('/alias/list'));
  }

  async getSongDetail(songId: string | number): Promise<ChunithmSongDetailSnapshot> {
    return mapChunithmSongDetail(await getJson(`/song/${encodeURIComponent(String(songId))}`));
  }

  async getCollections(kind: ChunithmCollectionKind): Promise<ChunithmCollectionListSnapshot> {
    return mapChunithmCollections(kind, await getJson(`/${kind}/list`));
  }
}

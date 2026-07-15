import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import { chartVersionKey, difficultyFromIndex } from '@/domain/catalog';
import type {
  AliasSnapshot, CatalogSnapshot, Chart, ChartNotes, ChartType, CollectionItem,
  CollectionKind, CollectionSnapshot, DataSource, PlateRequirement, PlateSnapshot, Song,
} from '@/domain/models';
import type { DetailedCatalogProvider } from './contracts';
import { ProviderError, providerErrorFromStatus } from './errors';

const API_ROOT = 'https://maimai.lxns.net/api/v0/maimai';

const VersionSchema = z.object({
  id: z.number().int(), title: z.string().min(1), version: z.number().int().positive(),
}).passthrough();
const NotesSchema = z.object({
  total: z.number().int().nonnegative(), tap: z.number().int().nonnegative(),
  hold: z.number().int().nonnegative(), slide: z.number().int().nonnegative(),
  touch: z.number().int().nonnegative(), break: z.number().int().nonnegative(),
}).passthrough();
const DifficultySchema = z.object({
  type: z.enum(['standard', 'dx']), difficulty: z.number().int().min(0),
  level: z.string(), level_value: z.number().finite().nonnegative(),
  version: z.number().int().positive(), note_designer: z.string().nullish(),
  notes: NotesSchema.nullish(),
}).passthrough();
const SongSchema = z.object({
  id: z.number().int().nonnegative(), title: z.string(), artist: z.string().optional(),
  bpm: z.number().finite().nonnegative().optional(), genre: z.string().optional(),
  map: z.string().nullish(),
  rights: z.string().nullish(), version: z.number().int().positive(),
  disabled: z.boolean().optional(), locked: z.boolean().optional(),
  difficulties: z.object({
    standard: z.array(DifficultySchema).default([]), dx: z.array(DifficultySchema).default([]),
  }).passthrough(),
}).passthrough();
const CatalogResponseSchema = z.object({
  songs: z.array(SongSchema), versions: z.array(VersionSchema).min(1),
}).passthrough();
const AliasEntrySchema = z.object({
  song_id: z.number().int().nonnegative(), aliases: z.array(z.string()),
}).passthrough();
const AliasResponseSchema = z.union([
  z.array(AliasEntrySchema),
  z.object({ aliases: z.array(AliasEntrySchema) }).passthrough(),
]);
const RequirementSchema = z.object({
  difficulties: z.array(z.number().int().nonnegative()).default([]),
  rate: z.string().nullish(), fc: z.string().nullish(), fs: z.string().nullish(),
  songs: z.array(z.union([
    z.number().int().nonnegative(),
    z.object({ id: z.number().int().nonnegative(), title: z.string(), type: z.enum(['standard', 'dx']) }).passthrough(),
  ])).default([]),
}).passthrough();
const CollectionSchema = z.object({
  id: z.number().int(), name: z.string(), description: z.string().optional(),
  color: z.string().nullish(), genre: z.string().nullish(),
  required: z.array(RequirementSchema).optional(),
  requirements: z.array(RequirementSchema).optional(),
}).passthrough();
const PlateSchema = CollectionSchema;
const PlateResponseSchema = z.union([
  z.array(PlateSchema), z.object({ plates: z.array(PlateSchema) }).passthrough(),
]);
const COLLECTION_KINDS: readonly CollectionKind[] = ['trophy', 'icon', 'plate', 'frame'];
export type LxnsCollectionQuery = {
  kinds?: readonly CollectionKind[];
  required?: boolean;
};
const CollectionEnvelopeSchema = z.object({
  trophies: z.array(CollectionSchema).optional(),
  icons: z.array(CollectionSchema).optional(),
  plates: z.array(CollectionSchema).optional(),
  frames: z.array(CollectionSchema).optional(),
}).passthrough();
const CollectionListResponseSchema = z.union([
  z.array(CollectionSchema),
  CollectionEnvelopeSchema,
]);

function collectionEntries(
  kind: CollectionKind,
  payload: z.infer<typeof CollectionListResponseSchema>,
): z.infer<typeof CollectionSchema>[] {
  if (Array.isArray(payload)) return payload;
  switch (kind) {
    case 'trophy': return payload.trophies ?? [];
    case 'icon': return payload.icons ?? [];
    case 'plate': return payload.plates ?? [];
    case 'frame': return payload.frames ?? [];
  }
}

function source(label: string): DataSource {
  return { kind: 'lxns', label, updatedAt: new Date().toISOString(), isStale: false };
}
function chartType(type: 'standard' | 'dx'): ChartType { return type === 'dx' ? 'DX' : 'SD'; }

function versionAtOrBefore<T extends { version: number }>(versions: readonly T[], rawVersion: number): T | undefined {
  return versions.reduce<T | undefined>((matched, item) =>
    item.version <= rawVersion && (!matched || item.version > matched.version) ? item : matched, undefined);
}

async function getJson(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await expoFetch(`${API_ROOT}${path}`, {
      headers: { Accept: 'application/json' }, signal: controller.signal,
    });
    if (!response.ok) throw providerErrorFromStatus(response.status);
    return await response.json();
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof SyntaxError) throw new ProviderError('upstream_schema', 'LXNS 返回了无效 JSON', true, { cause: error });
    if (error instanceof Error && error.name === 'AbortError') throw new ProviderError('timeout', 'LXNS 公共 API 读取超时', true, { cause: error });
    throw new ProviderError('network', '无法连接 LXNS 公共 API', true, { cause: error });
  } finally { clearTimeout(timeout); }
}

function mapCatalog(input: unknown, label: string): CatalogSnapshot {
  const parsed = CatalogResponseSchema.safeParse(input);
  if (!parsed.success) throw new ProviderError('upstream_schema', 'LXNS 曲库响应结构与已验证契约不一致', true);
  const current = parsed.data.versions.reduce((latest, item) => item.version > latest.version ? item : latest);
  const chartVersionIndex: Record<string, number> = {};
  let currentChartCount = 0;
  const songs: Song[] = parsed.data.songs.map((rawSong) => {
    const charts: Chart[] = [...rawSong.difficulties.standard, ...rawSong.difficulties.dx].map((raw) => {
      const type = chartType(raw.type);
      const chartVersion = versionAtOrBefore(parsed.data.versions, raw.version);
      const chartVersionId = chartVersion?.version ?? raw.version;
      if (!rawSong.disabled) {
        chartVersionIndex[chartVersionKey(rawSong.id, type, raw.difficulty)] = chartVersionId;
        if (chartVersionId === current.version) currentChartCount += 1;
      }
      return {
        songId: String(rawSong.id), type, levelIndex: raw.difficulty, level: raw.level,
        difficulty: difficultyFromIndex(raw.difficulty), difficultyConstant: raw.level_value,
        charter: raw.note_designer ?? undefined, versionId: chartVersionId,
        notes: raw.notes ? { ...raw.notes } satisfies ChartNotes : undefined,
      };
    });
    const songVersion = versionAtOrBefore(parsed.data.versions, rawSong.version);
    return {
      id: String(rawSong.id), title: rawSong.title, artist: rawSong.artist,
      bpm: rawSong.bpm, genre: rawSong.genre, region: rawSong.map?.trim() || undefined,
      rights: rawSong.rights ?? undefined,
      locked: rawSong.locked, disabled: rawSong.disabled, versionId: songVersion?.version ?? rawSong.version,
      version: songVersion?.title ?? String(rawSong.version), charts,
    };
  });
  if (currentChartCount === 0) throw new ProviderError('upstream_schema', 'LXNS 最新版本没有可用谱面，拒绝猜测当前版本', true);
  return {
    currentVersion: { id: current.version, title: current.title },
    versions: parsed.data.versions.map((item) => ({ id: item.version, title: item.title })),
    songs, chartVersionIndex, source: source(label),
  };
}

export class LxnsCatalogProvider implements DetailedCatalogProvider {
  async getCatalog(): Promise<CatalogSnapshot> {
    return mapCatalog(await getJson('/song/list'), 'LXNS 公共曲库');
  }
  async getDetailedCatalog(): Promise<CatalogSnapshot> {
    return mapCatalog(await getJson('/song/list?notes=true'), 'LXNS 详细曲库');
  }
  async getAliases(): Promise<AliasSnapshot> {
    const parsed = AliasResponseSchema.safeParse(await getJson('/alias/list'));
    if (!parsed.success) throw new ProviderError('upstream_schema', 'LXNS 别名响应结构与已验证契约不一致', true);
    const entries = Array.isArray(parsed.data) ? parsed.data : parsed.data.aliases;
    return {
      aliases: entries.map((item) => ({ songId: String(item.song_id), aliases: item.aliases })),
      source: source('LXNS 别名库'),
    };
  }
  async getPlates(): Promise<PlateSnapshot> {
    const parsed = PlateResponseSchema.safeParse(await getJson('/plate/list?required=true'));
    if (!parsed.success) throw new ProviderError('upstream_schema', 'LXNS 姓名框响应结构与已验证契约不一致', true);
    const entries = Array.isArray(parsed.data) ? parsed.data : parsed.data.plates;
    return {
      plates: entries.map((item) => ({
        id: item.id, name: item.name, description: item.description,
        requirements: mapRequirements(item.required ?? item.requirements ?? []),
      })),
      source: source('LXNS 姓名框要求'),
    };
  }

  async getCollections(options: LxnsCollectionQuery = {}): Promise<CollectionSnapshot> {
    const kinds = options.kinds ?? COLLECTION_KINDS;
    const includeRequired = options.required ?? true;
    const responses = await Promise.all(
      kinds.map(async (kind) => ({
        kind,
        payload: await getJson(`/${kind}/list${includeRequired ? '?required=true' : ''}`),
      })),
    );
    const items: CollectionItem[] = [];
    for (const { kind, payload } of responses) {
      const parsed = CollectionListResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new ProviderError('upstream_schema', `LXNS ${kind} 收藏品响应结构与已验证契约不一致`, true);
      }
      const entries = collectionEntries(kind, parsed.data);
      for (const entry of entries) {
        items.push({
          id: entry.id,
          kind,
          name: entry.name,
          description: entry.description,
          color: entry.color,
          genre: entry.genre,
          requirements: mapRequirements(entry.required ?? entry.requirements ?? []),
        });
      }
    }
    return { items, source: source('LXNS 收藏品') };
  }
}

function mapRequirements(
  requirements: readonly z.infer<typeof RequirementSchema>[],
): PlateRequirement[] {
  return requirements.map((requirement) => {
    const songs = requirement.songs.map((song) => String(typeof song === 'number' ? song : song.id));
    const songTypes = Object.fromEntries(requirement.songs.flatMap((song) => typeof song === 'number'
      ? [] : [[String(song.id), chartType(song.type)]]));
    return {
      difficulties: requirement.difficulties, rate: requirement.rate,
      fc: requirement.fc, fs: requirement.fs, songs,
      songTypes: Object.keys(songTypes).length ? songTypes : undefined,
    };
  });
}

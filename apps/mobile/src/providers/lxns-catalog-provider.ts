import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import { chartVersionKey, difficultyFromIndex } from '@/domain/catalog';
import type {
  AliasSnapshot, CatalogSnapshot, Chart, ChartNotes, ChartType, DataSource,
  PlateSnapshot, Song,
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
const PlateSchema = z.object({
  id: z.number().int(), name: z.string(), description: z.string().optional(),
  required: z.array(RequirementSchema).optional(),
  requirements: z.array(RequirementSchema).optional(),
}).passthrough();
const PlateResponseSchema = z.union([
  z.array(PlateSchema), z.object({ plates: z.array(PlateSchema) }).passthrough(),
]);

function source(label: string): DataSource {
  return { kind: 'lxns', label, updatedAt: new Date().toISOString(), isStale: false };
}
function chartType(type: 'standard' | 'dx'): ChartType { return type === 'dx' ? 'DX' : 'SD'; }

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
  const versionTitles = new Map(parsed.data.versions.map((item) => [item.version, item.title]));
  const chartVersionIndex: Record<string, number> = {};
  let currentChartCount = 0;
  const songs: Song[] = parsed.data.songs.map((rawSong) => {
    const charts: Chart[] = [...rawSong.difficulties.standard, ...rawSong.difficulties.dx].map((raw) => {
      const type = chartType(raw.type);
      if (!rawSong.disabled) {
        chartVersionIndex[chartVersionKey(rawSong.id, type, raw.difficulty)] = raw.version;
        if (raw.version === current.version) currentChartCount += 1;
      }
      return {
        songId: String(rawSong.id), type, levelIndex: raw.difficulty, level: raw.level,
        difficulty: difficultyFromIndex(raw.difficulty), difficultyConstant: raw.level_value,
        charter: raw.note_designer ?? undefined, versionId: raw.version,
        notes: raw.notes ? { ...raw.notes } satisfies ChartNotes : undefined,
      };
    });
    return {
      id: String(rawSong.id), title: rawSong.title, artist: rawSong.artist,
      bpm: rawSong.bpm, genre: rawSong.genre, rights: rawSong.rights ?? undefined,
      locked: rawSong.locked, disabled: rawSong.disabled, versionId: rawSong.version,
      version: versionTitles.get(rawSong.version) ?? String(rawSong.version), charts,
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
        requirements: (item.required ?? item.requirements ?? []).map((requirement) => {
          const songs = requirement.songs.map((song) => String(typeof song === 'number' ? song : song.id));
          const songTypes = Object.fromEntries(requirement.songs.flatMap((song) => typeof song === 'number'
            ? [] : [[String(song.id), chartType(song.type)]]));
          return {
            difficulties: requirement.difficulties, rate: requirement.rate,
            fc: requirement.fc, fs: requirement.fs, songs,
            songTypes: Object.keys(songTypes).length ? songTypes : undefined,
          };
        }),
      })),
      source: source('LXNS 姓名框要求'),
    };
  }
}

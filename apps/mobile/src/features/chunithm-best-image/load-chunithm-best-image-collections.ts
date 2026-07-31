import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type { ChunithmBestImageStyleKind } from './chunithm-best-image-preferences';

const API_ROOT = 'https://maimai.lxns.net/api/v0/chunithm';

const CollectionItemSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().optional(),
  color: z.string().nullable().optional(),
}).passthrough();

export type ChunithmBestImageCollectionItem = {
  id: number;
  name: string;
  color?: string | null;
  kind: ChunithmBestImageStyleKind;
};

const ListResponseSchema = z.object({
  trophies: z.array(CollectionItemSchema).optional(),
  characters: z.array(CollectionItemSchema).optional(),
  plates: z.array(CollectionItemSchema).optional(),
}).passthrough();

const LIST_PATH: Record<ChunithmBestImageStyleKind, string> = {
  character: 'character',
  plate: 'plate',
  trophy: 'trophy',
};

const LIST_KEY: Record<ChunithmBestImageStyleKind, 'characters' | 'plates' | 'trophies'> = {
  character: 'characters',
  plate: 'plates',
  trophy: 'trophies',
};

async function fetchKindList(kind: ChunithmBestImageStyleKind): Promise<ChunithmBestImageCollectionItem[]> {
  const response = await expoFetch(`${API_ROOT}/${LIST_PATH[kind]}/list`);
  if (!response.ok) throw new Error(`无法加载中二${kind}列表（${response.status}）`);
  const parsed = ListResponseSchema.parse(await response.json());
  const rows = parsed[LIST_KEY[kind]] ?? [];
  return rows.map((item) => ({
    id: item.id,
    name: item.name?.trim() || `#${item.id}`,
    color: item.color,
    kind,
  }));
}

export async function loadChunithmBestImageCollections(): Promise<
  Record<ChunithmBestImageStyleKind, ChunithmBestImageCollectionItem[]>
> {
  const [character, plate, trophy] = await Promise.all([
    fetchKindList('character'),
    fetchKindList('plate'),
    fetchKindList('trophy'),
  ]);
  return { character, plate, trophy };
}

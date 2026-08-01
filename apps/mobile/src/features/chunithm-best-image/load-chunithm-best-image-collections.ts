import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';

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
  kind: 'character';
};

const ListResponseSchema = z.object({
  characters: z.array(CollectionItemSchema).optional(),
}).passthrough();

export async function loadChunithmBestImageCharacters(): Promise<ChunithmBestImageCollectionItem[]> {
  const response = await expoFetch(`${API_ROOT}/character/list`);
  if (!response.ok) throw new Error(`无法加载中二角色列表（${response.status}）`);
  const parsed = ListResponseSchema.parse(await response.json());
  const rows = parsed.characters ?? [];
  return rows.map((item) => ({
    id: item.id,
    name: item.name?.trim() || `#${item.id}`,
    color: item.color,
    kind: 'character',
  }));
}

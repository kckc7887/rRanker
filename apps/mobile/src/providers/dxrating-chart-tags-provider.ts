import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type {
  DxRatingChartTagsSnapshot,
  DxRatingChartTag,
  DxRatingSheetType,
} from '@/domain/dxrating-chart-tags';
import { ProviderError } from '@/providers/errors';

const TAGS_URL = 'https://miruku.dxrating.net/api/v1/tags';

const LocalizedStringSchema = z.record(z.string(), z.string());
const TagSchema = z.object({
  id: z.number().int(),
  localized_name: LocalizedStringSchema,
  localized_description: LocalizedStringSchema,
  group_id: z.number().int().nullable(),
}).passthrough();
const TagGroupSchema = z.object({
  id: z.number().int(),
  localized_name: LocalizedStringSchema,
  color: z.string().regex(/^#[\da-fA-F]{6}$/),
}).passthrough();
const TagRelationSchema = z.object({
  song_id: z.string().min(1),
  sheet_type: z.enum(['std', 'dx', 'utage', 'utage2p']),
  sheet_difficulty: z.string().min(1),
  tag_id: z.number().int(),
}).passthrough();
const TagsResponseSchema = z.object({
  tags: z.array(TagSchema),
  tagGroups: z.array(TagGroupSchema),
  tagSongs: z.array(TagRelationSchema),
}).passthrough();

function localizedText(value: Record<string, string>): string {
  for (const locale of ['zh-Hans', 'en', 'ja', 'zh-Hant', 'ko']) {
    const text = value[locale]?.trim();
    if (text) return text;
  }
  return Object.values(value).map((text) => text.trim()).find(Boolean) ?? '';
}

function plainDescription(value: Record<string, string>): string {
  return localizedText(value)
    .replace(/~~/g, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .trim();
}

function providerErrorFromStatus(status: number): ProviderError {
  if (status === 429) return new ProviderError('rate_limit', 'DXRating 请求过于频繁，请稍后重试', true);
  if (status >= 500) return new ProviderError('network', 'DXRating 服务暂时不可用', true);
  return new ProviderError('network', `DXRating 返回 HTTP ${status}`, status >= 500);
}

export function mapDxRatingChartTags(input: unknown): DxRatingChartTagsSnapshot {
  const parsed = TagsResponseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProviderError('upstream_schema', 'DXRating 标签响应结构与已验证契约不一致', true);
  }
  if (parsed.data.tagGroups.length === 0) {
    throw new ProviderError('upstream_schema', 'DXRating 标签响应缺少标签分组', true);
  }

  const groupsById = new Map(parsed.data.tagGroups.map((group) => [group.id, group]));
  const tagIds = new Set<number>();
  const tags: DxRatingChartTag[] = [];
  for (const tag of parsed.data.tags) {
    if (tag.group_id === null || tagIds.has(tag.id)) continue;
    const group = groupsById.get(tag.group_id);
    if (!group) continue;
    tagIds.add(tag.id);
    tags.push({
      id: tag.id,
      name: localizedText(tag.localized_name),
      description: plainDescription(tag.localized_description),
      color: group.color,
      groupId: group.id,
      groupName: localizedText(group.localized_name),
    });
  }
  return {
    tags,
    relations: parsed.data.tagSongs
      .filter((relation) => tagIds.has(relation.tag_id))
      .map((relation) => ({
        songTitle: relation.song_id,
        sheetType: relation.sheet_type as DxRatingSheetType,
        sheetDifficulty: relation.sheet_difficulty,
        tagId: relation.tag_id,
      })),
    source: {
      kind: 'dxrating',
      label: 'DXRating 谱面标签',
      updatedAt: new Date().toISOString(),
      isStale: false,
    },
  };
}

export class DxRatingChartTagsProvider {
  async getChartTags(): Promise<DxRatingChartTagsSnapshot> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await expoFetch(TAGS_URL, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw providerErrorFromStatus(response.status);
      return mapDxRatingChartTags(await response.json());
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof SyntaxError) {
        throw new ProviderError('upstream_schema', 'DXRating 返回了无效 JSON', true, { cause: error });
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderError('timeout', 'DXRating 谱面标签读取超时', true, { cause: error });
      }
      throw new ProviderError('network', '无法连接 DXRating 谱面标签服务', true, { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}

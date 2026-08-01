import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type {
  DxRatingChartTagsSnapshot,
  DxRatingConfigurationTag,
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

export function mapDxRatingConfigurationTags(input: unknown): DxRatingChartTagsSnapshot {
  const parsed = TagsResponseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProviderError('upstream_schema', 'DXRating 标签响应结构与已验证契约不一致', true);
  }
  const configurationGroup = parsed.data.tagGroups.find((group) => (
    group.localized_name['zh-Hans']?.trim() === '配置'
    || group.localized_name.en?.trim() === 'Patterns'
  ));
  if (!configurationGroup) {
    throw new ProviderError('upstream_schema', 'DXRating 标签响应缺少配置分组', true);
  }

  const rawTags = parsed.data.tags.filter((tag) => tag.group_id === configurationGroup.id);
  const tagIds = new Set(rawTags.map((tag) => tag.id));
  const tags: DxRatingConfigurationTag[] = rawTags.map((tag) => ({
    id: tag.id,
    name: localizedText(tag.localized_name),
    description: plainDescription(tag.localized_description),
    color: configurationGroup.color,
  }));
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
      label: 'DXRating 配置标签',
      updatedAt: new Date().toISOString(),
      isStale: false,
    },
  };
}

export class DxRatingChartTagsProvider {
  async getConfigurationTags(): Promise<DxRatingChartTagsSnapshot> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await expoFetch(TAGS_URL, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw providerErrorFromStatus(response.status);
      return mapDxRatingConfigurationTags(await response.json());
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof SyntaxError) {
        throw new ProviderError('upstream_schema', 'DXRating 返回了无效 JSON', true, { cause: error });
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderError('timeout', 'DXRating 配置标签读取超时', true, { cause: error });
      }
      throw new ProviderError('network', '无法连接 DXRating 配置标签服务', true, { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}

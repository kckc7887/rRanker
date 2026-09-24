import { z } from 'zod';
import type {
  DxRatingChartTagsSnapshot,
  DxRatingChartTag,
  DxRatingSheetType,
} from '@/domain/dxrating-chart-tags';
import { ProviderError, providerErrorFromStatus, type ProviderStatusTexts } from '@/providers/errors';
import { requestJson } from '@/providers/http-json';

const DXRATING_BASE_URL = 'https://miruku.dxrating.net';
/**
 * 领域层按「song_id 即曲名」匹配，这只在 legacy 方案下成立；接口默认方案未在契约中固定，
 * 且同一接口的 public 方案返回不透明 ID 与新增 sheet_id，必须显式请求 legacy，避免默认方案变更后静默失配。
 */
const DXRATING_TAGS_PATH = '/api/v1/tags?idScheme=legacy';

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

function richDescription(value: Record<string, string>) {
  const markdown = localizedText(value)
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .trim();
  const segments: { text: string; strikethrough: boolean }[] = [];
  const pattern = /~~([\s\S]*?)~~/g;
  let cursor = 0;
  for (const match of markdown.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ text: markdown.slice(cursor, index), strikethrough: false });
    if (match[1]) segments.push({ text: match[1], strikethrough: true });
    cursor = index + match[0].length;
  }
  if (cursor < markdown.length) segments.push({ text: markdown.slice(cursor), strikethrough: false });
  if (segments.length === 0 && markdown) segments.push({ text: markdown, strikethrough: false });
  return { text: segments.map((segment) => segment.text).join(''), segments };
}

const DXRATING_STATUS_TEXTS: ProviderStatusTexts = {
  rateLimit: 'DXRating 请求过于频繁，请稍后重试',
  server: 'DXRating 服务暂时不可用',
  fallback: { message: (status) => `DXRating 返回 HTTP ${status}`, code: 'network' },
};

export function mapDxRatingChartTags(input: unknown): DxRatingChartTagsSnapshot {
  const parsed = TagsResponseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProviderError('upstream_schema', 'DXRating 标签响应结构与已验证契约不一致', true);
  }
  return buildDxRatingChartTagsSnapshot(parsed.data);
}

type DxRatingTagsResponse = z.output<typeof TagsResponseSchema>;

function buildDxRatingChartTagsSnapshot(parsed: DxRatingTagsResponse): DxRatingChartTagsSnapshot {
  if (parsed.tagGroups.length === 0) {
    throw new ProviderError('upstream_schema', 'DXRating 标签响应缺少标签分组', true);
  }

  const groupsById = new Map(parsed.tagGroups.map((group) => [group.id, group]));
  const tagIds = new Set<number>();
  const tags: DxRatingChartTag[] = [];
  for (const tag of parsed.tags) {
    if (tag.group_id === null || tagIds.has(tag.id)) continue;
    const group = groupsById.get(tag.group_id);
    if (!group) continue;
    const description = richDescription(tag.localized_description);
    tagIds.add(tag.id);
    tags.push({
      id: tag.id,
      name: localizedText(tag.localized_name),
      description: description.text,
      descriptionSegments: description.segments,
      color: group.color,
      groupId: group.id,
      groupName: localizedText(group.localized_name),
    });
  }
  return {
    tags,
    relations: parsed.tagSongs
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
  async getChartTags(signal?: AbortSignal): Promise<DxRatingChartTagsSnapshot> {
    const parsed = await requestJson({
      baseUrl: DXRATING_BASE_URL,
      path: DXRATING_TAGS_PATH,
      schema: TagsResponseSchema,
      fetcher: fetch,
      signal,
      label: 'DXRating',
      timeoutMs: 12_000,
      retries: 1,
      diagnosticScenario: 'metadata',
      error: (status) => providerErrorFromStatus(status, DXRATING_STATUS_TEXTS),
      messages: {
        schema: 'DXRating 标签响应结构与已验证契约不一致',
        timeout: 'DXRating 谱面标签读取超时',
        network: '无法连接 DXRating 谱面标签服务',
      },
    });
    return buildDxRatingChartTagsSnapshot(parsed);
  }
}

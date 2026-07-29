import { z } from 'zod';
import type { GameId } from './game-bind-options';

export const GAME_MODEL_SCHEMA = 'rranker-game-model/v1' as const;

const JsonPrimitiveSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const FilterValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.union([z.string(), z.number().finite(), z.boolean()])),
]);

export const PaintSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('solid'),
    color: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal('gradient'),
    colors: z.tuple([z.string().min(1), z.string().min(1)]).rest(z.string().min(1)),
    locations: z.array(z.number().min(0).max(1)).optional(),
    direction: z.enum(['horizontal', 'vertical', 'diagonal-down', 'diagonal-up']).default('horizontal'),
    animated: z.boolean().default(false),
    durationMs: z.number().int().positive().optional(),
  }).strict().superRefine((paint, context) => {
    if (paint.locations && paint.locations.length !== paint.colors.length) {
      context.addIssue({
        code: 'custom',
        message: '渐变位置数量必须与颜色数量一致',
        path: ['locations'],
      });
    }
    if (paint.animated && paint.durationMs === undefined) {
      context.addIssue({
        code: 'custom',
        message: '流动渐变必须提供 durationMs',
        path: ['durationMs'],
      });
    }
  }),
]);

export const OverlaySchema = z.object({
  paint: PaintSchema,
  opacity: z.number().min(0).max(1),
}).strict();

export const SurfaceStyleSchema = z.object({
  border: PaintSchema.optional(),
  background: PaintSchema.optional(),
  overlay: OverlaySchema.optional(),
}).strict();

export const TextPaintSchema = z.object({
  fill: PaintSchema,
  stroke: z.object({
    enabled: z.boolean(),
    paint: PaintSchema,
  }).strict().optional(),
  offset: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }).strict().optional(),
}).strict();

export const TagItemStyleSchema = z.object({
  surface: SurfaceStyleSchema.optional(),
  text: TextPaintSchema,
}).strict();

const TagValueSchema: z.ZodType<TagValue> = z.lazy(() => z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('int'), value: z.number().int() }).strict(),
  z.object({ kind: z.literal('float'), value: z.number().finite() }).strict(),
  z.object({ kind: z.literal('string'), value: z.string() }).strict(),
  z.object({ kind: z.literal('tag-group'), value: TagGroupInstanceSchema }).strict(),
]));

export const TagGroupInstanceSchema: z.ZodType<TagGroupInstance> = z.lazy(() => z.object({
  groupId: z.string().min(1),
  items: z.array(z.object({
    itemId: z.string().min(1),
    value: TagValueSchema.optional(),
    auxiliaryValue: z.number().finite().optional(),
  }).strict()).min(1),
}).strict());

const TagDefinitionItemSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  style: TagItemStyleSchema.optional(),
  defaultValue: TagValueSchema.optional(),
  detailCardBackground: PaintSchema.optional(),
}).strict().superRefine((item, context) => {
  if (item.defaultValue?.kind === 'tag-group' && item.style) {
    context.addIssue({
      code: 'custom',
      message: '值为标签组时外层标签样式必须省略',
      path: ['style'],
    });
  }
});

const TagGroupBaseSchema = z.object({
  id: z.string().min(1),
  items: z.array(TagDefinitionItemSchema).min(1),
  shape: z.enum(['none', 'pill', 'rounded-rect']).default('none'),
});

const TypeAxisTagGroupSchema = TagGroupBaseSchema.extend({
  role: z.literal('type-axis'),
}).strict();

const DifficultyAxisTagGroupSchema = TagGroupBaseSchema.extend({
  role: z.literal('difficulty-axis'),
  valueSeparator: z.enum(['parentheses', 'space']),
  simplifiedInCatalog: z.literal(true),
}).strict();

const AttributeTagGroupSchema = TagGroupBaseSchema.extend({
  role: z.literal('attribute'),
  scope: z.enum(['song', 'chart']),
}).strict();

export const TagGroupDefinitionSchema = z.discriminatedUnion('role', [
  TypeAxisTagGroupSchema,
  DifficultyAxisTagGroupSchema,
  AttributeTagGroupSchema,
]);

export const ActionRefSchema = z.object({
  id: z.enum([
    'switch-account',
    'upload',
    'sync',
    'route',
    'toggle-favorite',
    'toggle-practice',
    'edit-tags',
    'open-external-search',
  ]),
  params: z.record(z.string(), JsonPrimitiveSchema).default({}),
}).strict().superRefine((action, context) => {
  if (action.id === 'route' && typeof action.params.pathname !== 'string') {
    context.addIssue({
      code: 'custom',
      message: 'route 动作必须提供字符串 pathname',
      path: ['params', 'pathname'],
    });
  }
});

export const AssetRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('remote'), uri: z.string().url() }).strict(),
  z.object({ kind: z.literal('bundled'), key: z.string().min(1) }).strict(),
  z.object({
    kind: z.literal('resolver'),
    resolverId: z.enum(['maimai-jacket', 'phigros-illustration', 'chunithm-jacket']),
    key: z.string().min(1),
  }).strict(),
]);

const FilterToggleSchema = z.object({
  leftLabel: z.string(),
  rightLabel: z.string(),
  defaultValue: z.boolean(),
}).strict();

const FilterBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  toggle: FilterToggleSchema.optional(),
});

const TagsFilterSchema = FilterBaseSchema.extend({
  control: z.literal('tags'),
  options: z.array(z.object({
    value: z.string(),
    label: z.string(),
    tag: z.object({ groupId: z.string(), itemId: z.string() }).strict().optional(),
  }).strict()).min(1),
}).strict();

const ListFilterSchema = FilterBaseSchema.extend({
  control: z.literal('list'),
  options: z.array(z.object({ value: z.string(), label: z.string() }).strict()).min(1),
}).strict();

const RangeFilterSchema = FilterBaseSchema.extend({
  control: z.literal('range'),
  minimum: z.number().finite().optional(),
  maximum: z.number().finite().optional(),
  unit: z.string().optional(),
}).strict().superRefine((filter, context) => {
  if (filter.minimum !== undefined && filter.maximum !== undefined && filter.minimum > filter.maximum) {
    context.addIssue({ code: 'custom', message: '范围下限不能大于上限', path: ['minimum'] });
  }
});

export const FilterDefinitionSchema = z.discriminatedUnion('control', [
  TagsFilterSchema,
  ListFilterSchema,
  RangeFilterSchema,
]);

const PageDefinitionSchema = z.object({
  enabled: z.boolean(),
  searchPlaceholder: z.string().optional(),
  filters: z.array(FilterDefinitionSchema).default([]),
  slots: z.array(z.enum([
    'account-name',
    'primary-card',
    'secondary-badge',
    'sync-actions',
    'toolbox',
    'library',
    'source-status',
    'search',
    'filters',
    'content',
    'local-tags',
    'custom-sections',
  ])).default([]),
  actions: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    action: ActionRefSchema,
  }).strict()).default([]),
}).strict();

export const GameManifestV1Schema = z.object({
  schema: z.literal(GAME_MODEL_SCHEMA),
  gameId: z.enum(['maimai', 'chunithm', 'phigros', 'test']),
  displayName: z.string().min(1),
  assetResolvers: z.array(z.enum([
    'maimai-jacket',
    'phigros-illustration',
    'chunithm-jacket',
  ])).default([]),
  tagGroups: z.array(TagGroupDefinitionSchema).min(1),
  pages: z.object({
    overview: PageDefinitionSchema,
    best: PageDefinitionSchema,
    records: PageDefinitionSchema,
    catalog: PageDefinitionSchema,
    detail: PageDefinitionSchema,
  }).strict(),
}).strict().superRefine((manifest, context) => {
  const difficultyGroups = manifest.tagGroups.filter((group) => group.role === 'difficulty-axis');
  const typeGroups = manifest.tagGroups.filter((group) => group.role === 'type-axis');
  if (difficultyGroups.length !== 1) {
    context.addIssue({
      code: 'custom',
      message: '每个游戏必须且只能注册一个难度标签组',
      path: ['tagGroups'],
    });
  }
  if (typeGroups.length > 1) {
    context.addIssue({
      code: 'custom',
      message: '每个游戏最多注册一个类型标签组',
      path: ['tagGroups'],
    });
  }
  const groupIds = new Set<string>();
  for (const [groupIndex, group] of manifest.tagGroups.entries()) {
    if (groupIds.has(group.id)) {
      context.addIssue({ code: 'custom', message: '标签组 ID 必须唯一', path: ['tagGroups', groupIndex, 'id'] });
    }
    groupIds.add(group.id);
    const itemIds = new Set<string>();
    for (const [itemIndex, item] of group.items.entries()) {
      if (itemIds.has(item.id)) {
        context.addIssue({
          code: 'custom',
          message: '同一标签组内的标签 ID 必须唯一',
          path: ['tagGroups', groupIndex, 'items', itemIndex, 'id'],
        });
      }
      itemIds.add(item.id);
    }
  }
});

const SourceSchema = z.object({
  id: z.enum(['scores', 'catalog']),
  label: z.string(),
  updatedAt: z.string().datetime().optional(),
  state: z.enum(['live', 'cache', 'unavailable']),
}).strict();

const TagRefSchema = z.object({
  groupId: z.string().min(1),
  itemId: z.string().min(1),
  value: TagValueSchema.optional(),
  auxiliaryValue: z.number().finite().optional(),
}).strict();

const ChartDocumentSchema = z.object({
  id: z.string().min(1),
  difficulty: TagRefSchema,
  attributes: z.array(TagGroupInstanceSchema).default([]),
  filterValues: z.record(z.string(), FilterValueSchema).default({}),
}).strict();

const ChartGroupDocumentSchema = z.object({
  type: TagRefSchema.optional(),
  charts: z.array(ChartDocumentSchema).min(1),
}).strict();

const CustomSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  kind: z.enum(['list', 'text', 'actions']),
  items: z.array(z.object({
    id: z.string().min(1),
    title: z.string(),
    subtitle: z.string().optional(),
    action: ActionRefSchema.optional(),
  }).strict()),
}).strict();

const SongDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  artist: z.string(),
  cover: AssetRefSchema.optional(),
  attributes: z.array(TagGroupInstanceSchema).default([]),
  chartGroups: z.array(ChartGroupDocumentSchema).min(1),
  customSections: z.array(CustomSectionSchema).default([]),
  filterValues: z.record(z.string(), FilterValueSchema).default({}),
  searchText: z.string(),
}).strict();

const ScoreCardDocumentSchema = z.object({
  id: z.string().min(1),
  songId: z.string().min(1),
  chartId: z.string().min(1),
  title: z.string(),
  primaryValue: TagRefSchema,
  tagRows: z.array(z.array(TagRefSchema)).max(2),
  trailingMetric: TagRefSchema.optional(),
  filterValues: z.record(z.string(), FilterValueSchema).default({}),
  searchText: z.string(),
}).strict();

const BestSectionDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  chartCountLabel: z.string(),
  records: z.array(ScoreCardDocumentSchema),
}).strict();

const OverviewInfoCardSchema = z.object({
  label: z.string(),
  value: z.string(),
  meta: z.string(),
  sideBadge: z.object({ label: z.string(), value: z.string() }).strict().optional(),
  surface: SurfaceStyleSchema.optional(),
  text: TextPaintSchema.optional(),
}).strict();

const OverviewActionSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  accessibilityLabel: z.string().optional(),
  action: ActionRefSchema,
}).strict();

const OverviewDocumentSchema = z.object({
  accountName: z.string(),
  accountAction: ActionRefSchema,
  infoCard: OverviewInfoCardSchema,
  syncActions: z.array(OverviewActionSchema).min(1).max(2),
  toolboxSummary: z.string(),
  librarySummary: z.string(),
  sources: z.array(SourceSchema),
  currentVersion: z.string(),
}).strict();

export const GameDataDocumentV1Schema = z.object({
  schema: z.literal(GAME_MODEL_SCHEMA),
  gameId: z.enum(['maimai', 'chunithm', 'phigros', 'test']),
  overview: OverviewDocumentSchema,
  songs: z.array(SongDocumentSchema),
  records: z.array(ScoreCardDocumentSchema),
  bestSections: z.array(BestSectionDocumentSchema),
}).strict();

export type Paint = z.infer<typeof PaintSchema>;
export type SurfaceStyle = z.infer<typeof SurfaceStyleSchema>;
export type TextPaint = z.infer<typeof TextPaintSchema>;
export type TagValue =
  | { kind: 'int'; value: number }
  | { kind: 'float'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'tag-group'; value: TagGroupInstance };
export type TagGroupInstance = {
  groupId: string;
  items: {
    itemId: string;
    value?: TagValue;
    auxiliaryValue?: number;
  }[];
};
export type TagGroupDefinition = z.infer<typeof TagGroupDefinitionSchema>;
export type TagRef = z.infer<typeof TagRefSchema>;
export type FilterDefinition = z.infer<typeof FilterDefinitionSchema>;
export type ActionRef = z.infer<typeof ActionRefSchema>;
export type AssetRef = z.infer<typeof AssetRefSchema>;
export type GameManifestV1 = z.infer<typeof GameManifestV1Schema>;
export type GameDataDocumentV1 = z.infer<typeof GameDataDocumentV1Schema>;
export type SongDocument = z.infer<typeof SongDocumentSchema>;
export type CustomSection = z.infer<typeof CustomSectionSchema>;
export type ChartDocument = z.infer<typeof ChartDocumentSchema>;
export type ScoreCardDocument = z.infer<typeof ScoreCardDocumentSchema>;
export type BestSectionDocument = z.infer<typeof BestSectionDocumentSchema>;

export function parseGameManifest(value: unknown): GameManifestV1 {
  return GameManifestV1Schema.parse(value);
}

export function parseGameDataDocument(value: unknown): GameDataDocumentV1 {
  return GameDataDocumentV1Schema.parse(value);
}

/**
 * 校验 Manifest 与 Document 之间无法由单文件 Zod schema 表达的引用关系。
 * 适配器必须在把文档交给页面前调用本函数。
 */
export function validateGameModelContract(
  manifestValue: unknown,
  documentValue: unknown,
): { manifest: GameManifestV1; document: GameDataDocumentV1 } {
  const manifest = parseGameManifest(manifestValue);
  const document = parseGameDataDocument(documentValue);
  const problems: string[] = [];
  if (manifest.gameId !== document.gameId) {
    problems.push(`游戏 ID 不一致：Manifest=${manifest.gameId}，Document=${document.gameId}`);
  }

  const groups = new Map(manifest.tagGroups.map((group) => [group.id, group]));
  const validateTag = (
    ref: Pick<TagRef, 'groupId' | 'itemId'>,
    path: string,
    expectedRole?: TagGroupDefinition['role'],
  ) => {
    const group = groups.get(ref.groupId);
    if (!group) {
      problems.push(`${path} 引用了未注册标签组 ${ref.groupId}`);
      return;
    }
    if (expectedRole && group.role !== expectedRole) {
      problems.push(`${path} 必须引用 ${expectedRole}，实际为 ${group.role}`);
    }
    if (!group.items.some((item) => item.id === ref.itemId)) {
      problems.push(`${path} 引用了 ${ref.groupId} 中不存在的标签项 ${ref.itemId}`);
    }
  };
  const validateAttribute = (
    instance: TagGroupInstance,
    path: string,
    scope: 'song' | 'chart',
  ) => {
    const group = groups.get(instance.groupId);
    if (!group) {
      problems.push(`${path} 引用了未注册标签组 ${instance.groupId}`);
      return;
    }
    if (group.role !== 'attribute' || group.scope !== scope) {
      problems.push(`${path} 必须引用 scope=${scope} 的普通属性标签组`);
      return;
    }
    for (const [index, item] of instance.items.entries()) {
      if (!group.items.some((definition) => definition.id === item.itemId)) {
        problems.push(`${path}.items[${index}] 引用了不存在的标签项 ${item.itemId}`);
      }
    }
  };
  const validateScore = (score: ScoreCardDocument, path: string) => {
    validateTag(score.primaryValue, `${path}.primaryValue`);
    score.tagRows.forEach((row, rowIndex) => row.forEach((ref, tagIndex) => {
      validateTag(ref, `${path}.tagRows[${rowIndex}][${tagIndex}]`);
    }));
    if (score.trailingMetric) validateTag(score.trailingMetric, `${path}.trailingMetric`);
  };

  for (const [songIndex, song] of document.songs.entries()) {
    song.attributes.forEach((attribute, index) => (
      validateAttribute(attribute, `songs[${songIndex}].attributes[${index}]`, 'song')
    ));
    if (
      song.cover?.kind === 'resolver'
      && !manifest.assetResolvers.includes(song.cover.resolverId)
    ) {
      problems.push(
        `songs[${songIndex}].cover 使用了未注册资源解析器 ${song.cover.resolverId}`,
      );
    }
    for (const [groupIndex, chartGroup] of song.chartGroups.entries()) {
      if (chartGroup.type) {
        validateTag(
          chartGroup.type,
          `songs[${songIndex}].chartGroups[${groupIndex}].type`,
          'type-axis',
        );
      }
      for (const [chartIndex, chart] of chartGroup.charts.entries()) {
        const chartPath = `songs[${songIndex}].chartGroups[${groupIndex}].charts[${chartIndex}]`;
        validateTag(chart.difficulty, `${chartPath}.difficulty`, 'difficulty-axis');
        chart.attributes.forEach((attribute, index) => (
          validateAttribute(attribute, `${chartPath}.attributes[${index}]`, 'chart')
        ));
      }
    }
  }
  document.records.forEach((score, index) => validateScore(score, `records[${index}]`));
  document.bestSections.forEach((section, sectionIndex) => (
    section.records.forEach((score, index) => (
      validateScore(score, `bestSections[${sectionIndex}].records[${index}]`)
    ))
  ));

  for (const [pageId, page] of Object.entries(manifest.pages)) {
    for (const [filterIndex, filter] of page.filters.entries()) {
      if (filter.control !== 'tags') continue;
      filter.options.forEach((option, optionIndex) => {
        if (option.tag) {
          validateTag(
            option.tag,
            `pages.${pageId}.filters[${filterIndex}].options[${optionIndex}].tag`,
          );
        }
      });
    }
  }

  if (problems.length) {
    throw new Error(`rranker-game-model/v1 契约校验失败：\n- ${problems.join('\n- ')}`);
  }
  return { manifest, document };
}

export function findTagGroup(
  manifest: GameManifestV1,
  groupId: string,
): TagGroupDefinition | undefined {
  return manifest.tagGroups.find((group) => group.id === groupId);
}

export function findTagItem(
  manifest: GameManifestV1,
  ref: Pick<TagRef, 'groupId' | 'itemId'>,
) {
  return findTagGroup(manifest, ref.groupId)?.items.find((item) => item.id === ref.itemId);
}

export function canonicalChartId(
  gameId: GameId,
  songId: string | number,
  typeId: string | undefined,
  difficultyId: string | number,
): string {
  return [gameId, String(songId), typeId ?? 'default', String(difficultyId)]
    .map((part) => encodeURIComponent(part))
    .join(':');
}

export function parseCanonicalChartId(chartId: string): {
  gameId: string;
  songId: string;
  typeId?: string;
  difficultyId: string;
} | undefined {
  const parts = chartId.split(':');
  if (parts.length !== 4) return undefined;
  try {
    const [gameId, songId, encodedType, difficultyId] = parts.map(decodeURIComponent);
    if (!gameId || !songId || !encodedType || !difficultyId) return undefined;
    return {
      gameId,
      songId,
      typeId: encodedType === 'default' ? undefined : encodedType,
      difficultyId,
    };
  } catch {
    return undefined;
  }
}

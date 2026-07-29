import type { GameId } from './game-bind-options';
import {
  GAME_MODEL_SCHEMA,
  parseGameManifest,
  type GameManifestV1,
  type Paint,
  type TagItemStyleSchema,
} from './game-model';
import type { z } from 'zod';

type TagStyle = z.input<typeof TagItemStyleSchema>;

const solid = (color: string): Paint => ({ kind: 'solid', color });
const flowingRainbow: Paint = {
  kind: 'gradient',
  colors: ['#73CFFF', '#EFCB63', '#FF8EC8', '#73CFFF'],
  locations: [0, 1 / 3, 2 / 3, 1],
  direction: 'horizontal',
  animated: true,
  durationMs: 2_200,
};
const flowingGold: Paint = {
  kind: 'gradient',
  colors: ['#84530A', '#EFCB63', '#FFF2A8', '#EFCB63', '#84530A'],
  direction: 'horizontal',
  animated: true,
  durationMs: 2_000,
};
const textStyle = (color: string): TagStyle => ({ text: { fill: solid(color) } });
const pill = (background: string, color = '#FFFFFF'): TagStyle => ({
  surface: { background: solid(background) },
  text: { fill: solid(color) },
});

const MAIMAI_DIFFICULTIES = [
  ['basic', 'BASIC', '#45B95B'],
  ['advanced', 'ADVANCED', '#E8B339'],
  ['expert', 'EXPERT', '#E75555'],
  ['master', 'MASTER', '#9A5ACD'],
  ['remaster', 'Re:MASTER', '#DAB6ED'],
  ['utage', 'U·TA·GE', '#D64E90'],
] as const;

const CHUNITHM_DIFFICULTIES = [
  ['basic', 'BASIC', '#42B75D'],
  ['advanced', 'ADVANCED', '#E2A933'],
  ['expert', 'EXPERT', '#E34C57'],
  ['master', 'MASTER', '#8A55C7'],
  ['ultima', 'ULTIMA', '#151515'],
  ['worlds-end', "WORLD'S END", '#777777'],
] as const;

const PHIGROS_DIFFICULTIES = [
  ['ez', 'EZ', '#45B95B'],
  ['hd', 'HD', '#3C82D6'],
  ['in', 'IN', '#E75555'],
  ['at', 'AT', '#4D4D4D'],
] as const;

function basePages(searchPlaceholder: string, bestImageLabel?: string) {
  return {
    overview: {
      enabled: true,
      filters: [],
      slots: [
        'account-name', 'primary-card', 'secondary-badge', 'sync-actions',
        'toolbox', 'library', 'source-status',
      ],
    },
    best: {
      enabled: true,
      filters: [],
      slots: ['source-status', 'content'],
      actions: bestImageLabel ? [{
        id: 'best-image',
        label: bestImageLabel,
        action: { id: 'route', params: { pathname: '/best-image' } },
      }] : [],
    },
    records: {
      enabled: true,
      searchPlaceholder,
      filters: [],
      slots: ['source-status', 'search', 'filters', 'content'],
    },
    catalog: {
      enabled: true,
      searchPlaceholder,
      filters: [],
      slots: ['source-status', 'search', 'filters', 'content'],
    },
    detail: {
      enabled: true,
      filters: [],
      slots: ['content', 'local-tags', 'custom-sections'],
    },
  };
}

const maimaiManifest = parseGameManifest({
  schema: GAME_MODEL_SCHEMA,
  gameId: 'maimai',
  displayName: '舞萌 DX',
  assetResolvers: ['maimai-jacket'],
  tagGroups: [
    {
      id: 'chart-type',
      role: 'type-axis',
      shape: 'pill',
      items: [
        { id: 'sd', label: 'SD', style: pill('#2C9E70') },
        { id: 'dx', label: 'DX', style: pill('#E38B2C') },
        { id: 'utage', label: 'U·TA·GE', style: pill('#D64E90') },
      ],
    },
    {
      id: 'difficulty',
      role: 'difficulty-axis',
      shape: 'pill',
      valueSeparator: 'parentheses',
      simplifiedInCatalog: true,
      items: MAIMAI_DIFFICULTIES.map(([id, label, color]) => ({
        id,
        label,
        style: pill(color),
        detailCardBackground: solid(color),
      })),
    },
    {
      id: 'achievement',
      role: 'attribute',
      scope: 'chart',
      shape: 'none',
      items: [{ id: 'value', label: '达成率', style: textStyle('#111827') }],
    },
    {
      id: 'rating',
      role: 'attribute',
      scope: 'chart',
      shape: 'none',
      items: [{ id: 'value', label: 'Rating', style: textStyle('#246BFD') }],
    },
    {
      id: 'rate',
      role: 'attribute',
      scope: 'chart',
      shape: 'pill',
      items: [{ id: 'value', label: '评价', style: pill('#E5E7EB', '#374151') }],
    },
    {
      id: 'fc',
      role: 'attribute',
      scope: 'chart',
      shape: 'pill',
      items: [{ id: 'value', label: '单人成就', style: pill('#E8B339') }],
    },
    {
      id: 'fs',
      role: 'attribute',
      scope: 'chart',
      shape: 'pill',
      items: [{ id: 'value', label: '多人成就', style: pill('#3C82D6') }],
    },
    {
      id: 'version',
      role: 'attribute',
      scope: 'song',
      shape: 'none',
      items: [{ id: 'value', label: '版本', style: textStyle('#6B7280') }],
    },
    ...[
      ['aliases', '别名'],
      ['genre', '分类'],
      ['bpm', 'BPM'],
      ['region', '区域'],
    ].map(([id, label]) => ({
      id,
      role: 'attribute' as const,
      scope: 'song' as const,
      shape: 'none' as const,
      items: [{ id: 'value', label, style: textStyle('#6B7280') }],
    })),
    {
      id: 'special',
      role: 'attribute',
      scope: 'chart',
      shape: 'none',
      items: [{ id: 'value', label: '特殊谱面', style: textStyle('#6B7280') }],
    },
    {
      id: 'charter',
      role: 'attribute',
      scope: 'chart',
      shape: 'none',
      items: [{ id: 'value', label: '谱师', style: textStyle('#6B7280') }],
    },
    {
      id: 'notes',
      role: 'attribute',
      scope: 'chart',
      shape: 'none',
      items: [
        ['table', '物量表'],
        ['tap', 'Tap'],
        ['hold', 'Hold'],
        ['slide', 'Slide'],
        ['touch', 'Touch'],
        ['break', 'Break'],
        ['total', '总物量'],
      ].map(([id, label]) => ({ id, label, style: textStyle('#6B7280') })),
    },
  ],
  pages: {
    ...basePages('曲名 / ID / 别名 / 曲师 / 谱师 / 罗马音', '生成B50图片'),
    catalog: {
      enabled: true,
      searchPlaceholder: '曲名 / ID / 别名 / 曲师 / 谱师 / 罗马音',
      filters: [
        {
          id: 'type',
          title: '类型',
          control: 'tags',
          options: [
            { value: 'SD', label: 'SD', tag: { groupId: 'chart-type', itemId: 'sd' } },
            { value: 'DX', label: 'DX', tag: { groupId: 'chart-type', itemId: 'dx' } },
            { value: 'UTAGE', label: 'U·TA·GE', tag: { groupId: 'chart-type', itemId: 'utage' } },
          ],
        },
        {
          id: 'difficulty',
          title: '难度',
          control: 'tags',
          options: MAIMAI_DIFFICULTIES.map(([id, label]) => ({
            value: id,
            label,
            tag: { groupId: 'difficulty', itemId: id },
          })),
        },
        { id: 'constant', title: '定数', control: 'range', minimum: 0, maximum: 20 },
        {
          id: 'version',
          title: '版本',
          control: 'list',
          options: [{ value: 'current', label: '当前版本' }],
          toggle: { leftLabel: '国服', rightLabel: '日服', defaultValue: false },
        },
      ],
    },
    records: {
      enabled: true,
      searchPlaceholder: '曲名 / 曲师 / 谱师 / 罗马音',
      filters: [
        {
          id: 'difficulty',
          title: '难度',
          control: 'tags',
          options: MAIMAI_DIFFICULTIES.map(([id, label]) => ({
            value: id,
            label,
            tag: { groupId: 'difficulty', itemId: id },
          })),
        },
        {
          id: 'type',
          title: '类型',
          control: 'tags',
          options: [
            { value: 'SD', label: 'SD' },
            { value: 'DX', label: 'DX' },
            { value: 'UTAGE', label: 'U·TA·GE' },
          ],
        },
        { id: 'constant', title: '定数', control: 'range', minimum: 0, maximum: 20 },
        { id: 'achievement', title: '达成率', control: 'range', minimum: 0, maximum: 101, unit: '%' },
        {
          id: 'fc',
          title: '单人成就',
          control: 'tags',
          options: ['fc', 'fcp', 'ap', 'app'].map((value) => ({
            value,
            label: value.toUpperCase(),
          })),
        },
        {
          id: 'fs',
          title: '多人成就',
          control: 'tags',
          options: ['fs', 'fsp', 'fsd', 'fsdp'].map((value) => ({
            value,
            label: value.toUpperCase(),
          })),
        },
        {
          id: 'version',
          title: '版本',
          control: 'list',
          options: [{ value: 'current', label: '当前版本' }],
          toggle: { leftLabel: '国服', rightLabel: '日服', defaultValue: false },
        },
      ],
    },
  },
});

const phigrosManifest = parseGameManifest({
  schema: GAME_MODEL_SCHEMA,
  gameId: 'phigros',
  displayName: 'Phigros',
  assetResolvers: ['phigros-illustration'],
  tagGroups: [
    {
      id: 'difficulty',
      role: 'difficulty-axis',
      shape: 'pill',
      valueSeparator: 'space',
      simplifiedInCatalog: true,
      items: PHIGROS_DIFFICULTIES.map(([id, label, color]) => ({
        id,
        label,
        style: pill(color),
        detailCardBackground: solid(color),
      })),
    },
    {
      id: 'score',
      role: 'attribute',
      scope: 'chart',
      shape: 'none',
      items: [
        { id: 'value', label: 'Score', style: textStyle('#111827') },
        { id: 'flowing', label: 'Score', style: { text: { fill: flowingRainbow } } },
      ],
    },
    {
      id: 'rks',
      role: 'attribute',
      scope: 'chart',
      shape: 'none',
      items: [{ id: 'value', label: 'RKS', style: textStyle('#246BFD') }],
    },
    {
      id: 'acc',
      role: 'attribute',
      scope: 'chart',
      shape: 'none',
      items: [{ id: 'value', label: 'Acc', style: textStyle('#111827') }],
    },
    {
      id: 'rate',
      role: 'attribute',
      scope: 'chart',
      shape: 'pill',
      items: [
        { id: 'value', label: '评价', style: pill('#E5E7EB', '#374151') },
        {
          id: 'flowing',
          label: '评价',
          style: {
            surface: { background: solid('#202532') },
            text: { fill: flowingRainbow },
          },
        },
      ],
    },
    {
      id: 'xing',
      role: 'attribute',
      scope: 'chart',
      shape: 'pill',
      items: [{ id: 'value', label: 'XING', style: pill('#3C82D6') }],
    },
    {
      id: 'illustrator',
      role: 'attribute',
      scope: 'song',
      shape: 'none',
      items: [{ id: 'value', label: '曲绘', style: textStyle('#6B7280') }],
    },
    {
      id: 'charter',
      role: 'attribute',
      scope: 'chart',
      shape: 'none',
      items: [{ id: 'value', label: '谱师', style: textStyle('#6B7280') }],
    },
    {
      id: 'notes',
      role: 'attribute',
      scope: 'chart',
      shape: 'none',
      items: [
        ['table', '物量表'],
        ['tap', 'Tap'],
        ['hold', 'Hold'],
        ['drag', 'Drag'],
        ['flick', 'Flick'],
        ['total', '总物量'],
      ].map(([id, label]) => ({ id, label, style: textStyle('#6B7280') })),
    },
  ],
  pages: {
    ...basePages('曲名 / 曲师 / 谱师', '生成B30图片'),
    catalog: {
      enabled: true,
      searchPlaceholder: '曲名 / 曲师 / 谱师',
      filters: [
        {
          id: 'difficulty',
          title: '难度',
          control: 'tags',
          options: PHIGROS_DIFFICULTIES.map(([id, label]) => ({
            value: id,
            label,
            tag: { groupId: 'difficulty', itemId: id },
          })),
        },
        { id: 'constant', title: '定数', control: 'range', minimum: 0, maximum: 20 },
      ],
    },
    records: {
      enabled: true,
      searchPlaceholder: '曲名 / 曲师 / 谱师',
      filters: [
        {
          id: 'difficulty',
          title: '难度',
          control: 'tags',
          options: PHIGROS_DIFFICULTIES.map(([id, label]) => ({
            value: id,
            label,
            tag: { groupId: 'difficulty', itemId: id },
          })),
        },
        { id: 'constant', title: '定数', control: 'range', minimum: 0, maximum: 20 },
        { id: 'accuracy', title: 'Acc', control: 'range', minimum: 0, maximum: 100, unit: '%' },
        {
          id: 'rate',
          title: '评价',
          control: 'list',
          options: ['phi', 'v', 's', 'a', 'b', 'c', 'f'].map((value) => ({
            value,
            label: value === 'phi' ? 'φ' : value.toUpperCase(),
          })),
        },
        {
          id: 'xing',
          title: 'XING',
          control: 'list',
          options: [
            { value: 'good', label: 'XING-GOOD' },
            { value: 'miss', label: 'XING-MISS' },
          ],
        },
      ],
    },
  },
});

const chunithmManifest = parseGameManifest({
  schema: GAME_MODEL_SCHEMA,
  gameId: 'chunithm',
  displayName: '中二节奏',
  assetResolvers: ['chunithm-jacket'],
  tagGroups: [
    {
      id: 'difficulty',
      role: 'difficulty-axis',
      shape: 'pill',
      valueSeparator: 'parentheses',
      simplifiedInCatalog: true,
      items: CHUNITHM_DIFFICULTIES.map(([id, label, color]) => ({
        id,
        label,
        style: pill(color),
        detailCardBackground: solid(color),
      })),
    },
    {
      id: 'score',
      role: 'attribute',
      scope: 'chart',
      shape: 'none',
      items: [
        { id: 'value', label: 'Score', style: textStyle('#111827') },
        { id: 'flowing', label: 'Score', style: { text: { fill: flowingRainbow } } },
      ],
    },
    {
      id: 'rating',
      role: 'attribute',
      scope: 'chart',
      shape: 'none',
      items: [{ id: 'value', label: 'Rating', style: textStyle('#246BFD') }],
    },
    {
      id: 'rank',
      role: 'attribute',
      scope: 'chart',
      shape: 'pill',
      items: [
        { id: 'value', label: '评价', style: pill('#E5E7EB', '#374151') },
        {
          id: 'flowing',
          label: '评价',
          style: {
            surface: { background: solid('#202532') },
            text: { fill: flowingRainbow },
          },
        },
      ],
    },
    {
      id: 'achievement',
      role: 'attribute',
      scope: 'chart',
      shape: 'pill',
      items: [
        { id: 'rainbow', label: '成就', style: { surface: { background: solid('#202532') }, text: { fill: flowingRainbow } } },
        { id: 'gold', label: '成就', style: { surface: { background: solid('#6B4705') }, text: { fill: flowingGold } } },
        { id: 'platinum', label: '成就', style: pill('#CBD5E1', '#334155') },
        { id: 'neutral', label: '成就', style: pill('#E5E7EB', '#4B5563') },
      ],
    },
    {
      id: 'over-power',
      role: 'attribute',
      scope: 'chart',
      shape: 'none',
      items: [{ id: 'value', label: 'OVER POWER', style: textStyle('#246BFD') }],
    },
    {
      id: 'charter',
      role: 'attribute',
      scope: 'chart',
      shape: 'none',
      items: [{ id: 'value', label: '谱师', style: textStyle('#6B7280') }],
    },
    {
      id: 'notes',
      role: 'attribute',
      scope: 'chart',
      shape: 'none',
      items: [
        ['table', '物量表'],
        ['total', '总物量'],
        ['tap', 'Tap'],
        ['hold', 'Hold'],
        ['slide', 'Slide'],
        ['air', 'Air'],
        ['flick', 'Flick'],
      ].map(([id, label]) => ({ id, label, style: textStyle('#6B7280') })),
    },
  ],
  pages: {
    ...basePages('曲名 / ID / 曲师 / 谱师'),
    catalog: {
      enabled: true,
      searchPlaceholder: '曲名 / ID / 曲师 / 谱师',
      filters: [
        {
          id: 'difficulty',
          title: '难度',
          control: 'tags',
          options: CHUNITHM_DIFFICULTIES.map(([id, label]) => ({
            value: id,
            label,
            tag: { groupId: 'difficulty', itemId: id },
          })),
        },
        { id: 'constant', title: '定数', control: 'range', minimum: 0, maximum: 20 },
      ],
    },
    records: {
      enabled: true,
      searchPlaceholder: '曲名 / ID / 曲师 / 谱师',
      filters: [
        {
          id: 'difficulty',
          title: '难度',
          control: 'tags',
          options: CHUNITHM_DIFFICULTIES.map(([id, label]) => ({
            value: id,
            label,
            tag: { groupId: 'difficulty', itemId: id },
          })),
        },
        { id: 'score', title: 'Score', control: 'range', minimum: 0, maximum: 1010000 },
      ],
    },
  },
});

const testManifest = parseGameManifest({
  schema: GAME_MODEL_SCHEMA,
  gameId: 'test',
  displayName: '测试游戏',
  tagGroups: [{
    id: 'difficulty',
    role: 'difficulty-axis',
    shape: 'pill',
    valueSeparator: 'space',
    simplifiedInCatalog: true,
    items: [{ id: 'unknown', label: 'UNKNOWN', style: pill('#6B7280') }],
  }],
  pages: {
    overview: { enabled: true, filters: [] },
    best: { enabled: false, filters: [] },
    records: { enabled: false, filters: [] },
    catalog: { enabled: false, filters: [] },
    detail: { enabled: false, filters: [] },
  },
});

export const GAME_MANIFESTS: Record<GameId, GameManifestV1> = {
  maimai: maimaiManifest,
  phigros: phigrosManifest,
  chunithm: chunithmManifest,
  test: testManifest,
};

export function getGameManifest(gameId: GameId): GameManifestV1 {
  return GAME_MANIFESTS[gameId];
}

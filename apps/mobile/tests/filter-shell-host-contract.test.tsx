import { createHash } from 'node:crypto';
import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { MaimaiFilterBar } from '@/components/MaimaiFilterBar';
import { ArcadeFilterBar } from '@/components/ArcadeFilterBar';
import { ChunithmFilterBar } from '@/components/chunithm/ChunithmFilterBar';
import { MuseDashCatalogFilterBar, MuseDashRecordsFilterBar } from '@/components/musedash/MuseDashFilterBar';
import { PhigrosFilterBar } from '@/components/phigros/PhigrosFilterBar';
import { TufCatalogFilterBar, TufRandomFilterBar, TufRecordsFilterBar } from '@/components/adofai/TufFilterBar';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const noop = () => {};

const maimaiProps = {
  difficulty: 'master' as const,
  version: 'all' as const,
  type: 'DX' as const,
  constantMin: '13',
  constantMax: '',
  versionLocale: 'china' as const,
  versions: [
    { value: 'buddy', name: '舞萌BUDDiES', versionId: 25000 },
    { value: 'festival', name: 'FESTiVAL', versionId: 23000 },
  ],
  onCollapsedChange: noop,
  onDifficultyChange: noop,
  onVersionChange: noop,
  onTypeChange: noop,
  onConstantMinChange: noop,
  onConstantMaxChange: noop,
  onVersionLocaleChange: noop,
  onReset: noop,
};

const chunithmProps = {
  difficulty: 3 as const,
  version: '23000',
  constantMin: '14',
  constantMax: '14.9',
  versions: [{ id: 23000, title: 'CHUNITHM VERSE' }],
  onCollapsedChange: noop,
  onDifficultyChange: noop,
  onVersionChange: noop,
  onConstantMinChange: noop,
  onConstantMaxChange: noop,
  onReset: noop,
};

const museDashCatalogProps = {
  difficultySlot: 2 as const,
  dlc: 'Second Album' as const,
  constantMin: '8',
  constantMax: '',
  dlcOptions: ['Base', 'Second Album'],
  onCollapsedChange: noop,
  onDifficultySlotChange: noop,
  onDlcChange: noop,
  onConstantMinChange: noop,
  onConstantMaxChange: noop,
  onReset: noop,
};

const museDashRecordsProps = {
  ...museDashCatalogProps,
  accMin: '95',
  accMax: '',
  achievement: 'fc' as const,
  onAccMinChange: noop,
  onAccMaxChange: noop,
  onAchievementChange: noop,
};

const phigrosProps = {
  level: 2 as const,
  constantMin: '15',
  constantMax: '',
  accuracyMin: '90',
  accuracyMax: '',
  versions: [{ id: 5, title: 'Chapter 5 霓虹灯牌' }],
  chapter: 'all' as const,
  selectRows: [{
    id: 'sort',
    label: '排序',
    value: 'rating',
    defaultValue: 'default',
    options: [
      { value: 'default', label: '默认' },
      { value: 'rating', label: 'Rating' },
    ],
    accessibilityLabel: '选择排序',
    optionAccessibilityPrefix: '选择排序',
    onChange: noop,
  }],
  onCollapsedChange: noop,
  onLevelChange: noop,
  onConstantMinChange: noop,
  onConstantMaxChange: noop,
  onAccuracyMinChange: noop,
  onAccuracyMaxChange: noop,
  onChapterChange: noop,
  onReset: noop,
};

const tufRecordsProps = {
  sortBy: 'score' as const,
  order: 'DESC' as const,
  bestPerLevel: true,
  difficultyBand: 'G' as const,
  difficultyMin: '10',
  difficultyMax: '15',
  includeSpecial: true,
  achievement: 'all' as const,
  onExpandedChange: noop,
  onSortByChange: noop,
  onOrderChange: noop,
  onBestPerLevelChange: noop,
  onDifficultyBandChange: noop,
  onDifficultyMinChange: noop,
  onDifficultyMaxChange: noop,
  onIncludeSpecialChange: noop,
  onAchievementChange: noop,
  onReset: noop,
};

const tufRandomProps = {
  difficultyBand: 'U' as const,
  difficultyMin: '5',
  difficultyMax: '',
  includeSpecial: false,
  achievement: 'pp' as const,
  onExpandedChange: noop,
  onDifficultyBandChange: noop,
  onDifficultyMinChange: noop,
  onDifficultyMaxChange: noop,
  onIncludeSpecialChange: noop,
  onAchievementChange: noop,
  onReset: noop,
};

const tufCatalogProps = {
  sortBy: 'DIFF' as const,
  order: 'ASC' as const,
  difficultyBand: 'P' as const,
  difficultyMin: '',
  difficultyMax: '12',
  includeSpecial: true,
  specialAvailable: true,
  onExpandedChange: noop,
  onSortByChange: noop,
  onOrderChange: noop,
  onDifficultyBandChange: noop,
  onDifficultyMinChange: noop,
  onDifficultyMaxChange: noop,
  onIncludeSpecialChange: noop,
  onReset: noop,
};

const arcadeProps = {
  origin: {
    source: 'custom' as const,
    latitude: 31.23,
    longitude: 121.47,
    label: '人民广场',
  },
  radiusKm: 10 as const,
  titleIds: [1],
  gameTitles: [
    { id: 1, key: 'maimai_dx', name: '舞萌DX', seats: 2 },
    { id: 3, key: 'chunithm', name: '中二节奏', seats: 1 },
  ],
  onCollapsedChange: noop,
  onUseGpsOrigin: noop,
  onEditOrigin: noop,
  onRadiusChange: noop,
  onTitleIdsChange: noop,
  onReset: noop,
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

test('exports the stable filter bar host tree contract', async () => {
  const screens = [
    await render(<MaimaiFilterBar {...maimaiProps} collapsed={false} />),
    await render(<MaimaiFilterBar {...maimaiProps} collapsed />),
    await render(<ChunithmFilterBar {...chunithmProps} collapsed={false} />),
    await render(<ChunithmFilterBar {...chunithmProps} collapsed />),
    await render(<MuseDashCatalogFilterBar {...museDashCatalogProps} collapsed={false} />),
    await render(<MuseDashCatalogFilterBar {...museDashCatalogProps} collapsed />),
    await render(<MuseDashRecordsFilterBar {...museDashRecordsProps} collapsed={false} />),
    await render(<MuseDashRecordsFilterBar {...museDashRecordsProps} collapsed />),
    await render(<PhigrosFilterBar {...phigrosProps} collapsed={false} />),
    await render(<PhigrosFilterBar {...phigrosProps} collapsed />),
    await render(<TufRecordsFilterBar {...tufRecordsProps} expanded />),
    await render(<TufRecordsFilterBar {...tufRecordsProps} expanded={false} />),
    await render(<TufRandomFilterBar {...tufRandomProps} expanded />),
    await render(<TufRandomFilterBar {...tufRandomProps} expanded={false} />),
    await render(<TufCatalogFilterBar {...tufCatalogProps} expanded />),
    await render(<TufCatalogFilterBar {...tufCatalogProps} expanded={false} />),
    await render(<ArcadeFilterBar {...arcadeProps} collapsed={false} />),
    await render(<ArcadeFilterBar {...arcadeProps} collapsed />),
  ];
  const trees = screens.map((screen) => screen.toJSON());
  const canonicalTrees = canonicalize(trees) as unknown[];
  const hash = createHash('sha256').update(JSON.stringify(canonicalTrees)).digest('hex');
  expect(trees).toHaveLength(18);
  // 基线包含本次已授权的公共双端 Range Selector：
  // MuseDash/TUF/舞萌/中二/Phigros 的有界连续范围改造后，其余 FilterShell 结构继续受同一合同保护。
  expect(hash).toBe('f69d9201cf74d143e0045b9dcd978814630b745aa05b8bd53616c42f91177ebc');
});

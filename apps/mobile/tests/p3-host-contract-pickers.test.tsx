/**
 * 宿主树回归基线，禁止更新哈希接受差异。
 * 覆盖：4 个 best-image picker（maimai 收藏品 / 中二角色 / 中二背景歌曲 / Phigros 素材）
 * 全弹层 Host Tree（Modal + grabber + header + 搜索 + 模式区 + 列表项）。
 * mock 使用 chunithm-best-image-background-picker / p3-host-contract-* 测试配置：
 * 固定 insets 与主题、expo-image 回落 RN.Image、expo-linear-gradient 回落 RN.View、
 * CachedTabActive 恒真、Animated.loop 静态 mock；不触发随机选择（渲染期无 Math.random）。
 */
import { createHash } from 'node:crypto';
import { Animated } from 'react-native';
import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { BestImageCollectionPicker } from '@/features/best-image/best-image-collection-picker';
import { ChunithmBestImageStylePicker } from '@/features/chunithm-best-image/chunithm-best-image-style-picker';
import { ChunithmBestImageBackgroundPicker } from '@/features/chunithm-best-image/chunithm-best-image-background-picker';
import { PhigrosBestImageStylePicker } from '@/features/phigros-best-image/phigros-best-image-style-picker';
import type { CollectionItem } from '@/domain/models';
import type { ChunithmSong } from '@/domain/chunithm';

jest.spyOn(Animated, 'loop').mockReturnValue({
  start: jest.fn(),
  stop: jest.fn(),
  reset: jest.fn(),
} as unknown as ReturnType<typeof Animated.loop>);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  background: '#F3F4F6', surface: '#FFFFFF', surfaceMuted: '#E5E7EB', input: '#F9FAFB',
  border: '#D1D5DB', text: '#111827', textSecondary: '#4B5563', textMuted: '#6B7280',
  accent: '#246BFD', accentSoft: '#DBEAFE',
}) }));
jest.mock('@/components/CachedTabScreen', () => ({
  useCachedTabActive: () => true,
}));
jest.mock('expo-image', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Image: ({ source, ...props }: { source?: unknown }) => (
      <RN.Image {...props} source={{ uri: String(source) }} />
    ),
  };
});
jest.mock('expo-linear-gradient', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LinearGradient: ({ children, ...props }: { children?: React.ReactNode }) => (
      <RN.View {...props}>{children}</RN.View>
    ),
  };
});

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      // FlatList 的 ListHeaderComponent 会在 toJSON 里泄漏原始 React element，
      // 其 _owner（Fiber 环）与 _source（文件行号，重构会移动）必须剥离；
      // Host 视图自身 props 不含下划线前缀键，剥离不影响真实渲染合同。
      .filter(([key]) => !key.startsWith('_'))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

async function treeHash(trees: unknown[]): Promise<string> {
  const canonical = canonicalize(trees) as unknown[];
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

const collectionItems: CollectionItem[] = [
  { id: 9001, kind: 'icon', name: '示例头像', requirements: [] },
  { id: 9002, kind: 'plate', name: '示例姓名框', requirements: [] },
  { id: 9003, kind: 'trophy', name: '金牌称号', color: 'Gold', requirements: [] },
  { id: 9004, kind: 'trophy', name: '彩虹称号', color: 'Rainbow', requirements: [] },
  { id: 9005, kind: 'frame', name: '示例背景', requirements: [] },
];

const characters = [
  { id: 10001, name: 'シェリー', kind: 'character' as const },
  { id: 10002, name: 'GX_1号机', kind: 'character' as const },
];

const songs: ChunithmSong[] = [
  {
    id: 3, title: 'B.B.K.K.B.K.K.', artist: 'nora2r', genre: '其他游戏', bpm: 170,
    versionId: 1, versionTitle: 'CHUNITHM', locked: false, disabled: false, difficulties: [],
  },
  {
    id: 202, title: '光線チューニング', artist: 'ナユタン星人', genre: 'POPS & ANIME', bpm: 190,
    versionId: 2, versionTitle: 'STAR', locked: false, disabled: false, difficulties: [],
  },
];

const phigrosItems = [
  { key: 'avatar_a', label: '初始头像', meta: 'Illustrator A', source: { uri: 'avatar-a' } },
  { key: 'background_b', label: '初始背景', meta: 'Illustrator B', source: { uri: 'background-b' } },
];

test('maimai collection picker host tree contract', async () => {
  const screens = [
    // trophy：等级筛选区 + 金/彩虹两种预览 + item 选中态
    await render(
      <BestImageCollectionPicker
        visible
        kind="trophy"
        items={collectionItems}
        selectedId={9003}
        selectedMode="item"
        isLoading={false}
        isError={false}
        onRetry={jest.fn()}
        onClose={jest.fn()}
        onSelect={jest.fn()}
      />,
    ),
    // icon：CollectionImage 预览 + random 选中态
    await render(
      <BestImageCollectionPicker
        visible
        kind="icon"
        items={collectionItems}
        selectedId={null}
        selectedMode="random"
        isLoading={false}
        isError={false}
        onRetry={jest.fn()}
        onClose={jest.fn()}
        onSelect={jest.fn()}
      />,
    ),
    // plate：横幅预览 + off 选中态
    await render(
      <BestImageCollectionPicker
        visible
        kind="plate"
        items={collectionItems}
        selectedId={null}
        selectedMode="off"
        isLoading={false}
        isError={false}
        onRetry={jest.fn()}
        onClose={jest.fn()}
        onSelect={jest.fn()}
      />,
    ),
    // 加载与错误占位分支
    await render(
      <BestImageCollectionPicker
        visible
        kind="frame"
        items={[]}
        selectedId={null}
        selectedMode="current"
        isLoading
        isError={false}
        onRetry={jest.fn()}
        onClose={jest.fn()}
        onSelect={jest.fn()}
      />,
    ),
    await render(
      <BestImageCollectionPicker
        visible
        kind="frame"
        items={[]}
        selectedId={null}
        selectedMode="off"
        isLoading={false}
        isError
        onRetry={jest.fn()}
        onClose={jest.fn()}
        onSelect={jest.fn()}
      />,
    ),
  ];
  expect(await treeHash([
    screens[0]!.getByLabelText('金牌称号，#9003').toJSON(),
    screens[1]!.getByLabelText('示例头像，#9001').toJSON(),
    screens[2]!.getByLabelText('示例姓名框，#9002').toJSON(),
    screens[3]!.getByText('正在从落雪读取完整列表').toJSON(),
    screens[4]!.getByText('落雪收藏品加载失败').toJSON(),
  ])).toBe('63d6fc62e71559ce8a5ab2642d24967bad1315aa4bb1f49547c5be5657d053bc');
  screens.forEach((screen) => expect(screen.queryByText('恢复账号同步的素材')).toBeNull());
});

test('chunithm character picker host tree contract', async () => {
  const screens = [
    // item 选中态（三模式 chip + 角色图预览）
    await render(
      <ChunithmBestImageStylePicker
        visible
        items={characters}
        selection={{ mode: 'item', id: 10001, name: 'シェリー' }}
        onClose={jest.fn()}
        onSelect={jest.fn()}
      />,
    ),
    // off 选中态
    await render(
      <ChunithmBestImageStylePicker
        visible
        items={characters}
        selection={{ mode: 'off' }}
        onClose={jest.fn()}
        onSelect={jest.fn()}
      />,
    ),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON())))
    .toBe('1d2ab8eecff4f6f84ab0392f2cfbe99bb1ab7d31a417d0f818462bcda20f5a04');
});

test('chunithm background picker host tree contract', async () => {
  const screens = [
    // song 选中态（默认背景卡 + 歌曲封面预览）
    await render(
      <ChunithmBestImageBackgroundPicker
        visible
        songs={songs}
        selection={{ mode: 'song', songId: 3 }}
        onClose={jest.fn()}
        onSelect={jest.fn()}
      />,
    ),
    // default 选中态
    await render(
      <ChunithmBestImageBackgroundPicker
        visible
        songs={songs}
        selection={{ mode: 'default' }}
        onClose={jest.fn()}
        onSelect={jest.fn()}
      />,
    ),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON())))
    .toBe('4e8a920b3ac08a601d5f5b03390631eefbc499a74bd8486c0947380a5517db59');
});

test('phigros style picker host tree contract', async () => {
  const screens = [
    // avatar：item 选中态（快捷选择区 + 预览图）
    await render(
      <PhigrosBestImageStylePicker
        visible
        kind="avatar"
        items={phigrosItems}
        selection={{ mode: 'item', key: 'avatar_a' }}
        onClose={jest.fn()}
        onSelect={jest.fn()}
      />,
    ),
    // background：current 选中态
    await render(
      <PhigrosBestImageStylePicker
        visible
        kind="background"
        items={phigrosItems}
        selection={{ mode: 'current' }}
        onClose={jest.fn()}
        onSelect={jest.fn()}
      />,
    ),
  ];
  expect(await treeHash([
    screens[0]!.getByLabelText('初始头像，Illustrator A').toJSON(),
    screens[1]!.getByLabelText('初始背景，Illustrator B').toJSON(),
  ])).toBe('4e7791c0b5d9eb57f8cb238d1ad09ef35620df5cc57db066ca2c0e4538ec0784');
  screens.forEach((screen) => expect(screen.queryByText('恢复账号同步的素材')).toBeNull());
});

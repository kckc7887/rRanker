/**
 * P3 回归基线，采集自改造前现状，禁止更新哈希接受差异。
 * 覆盖：PhigrosSongDetail / ChunithmSongDetail 全页 Host Tree（Chrome + Hero + 轮播 + 信息卡）。
 * mock 手法沿用既有 phigros-song-detail.test.tsx / chunithm-song-detail.test.tsx：
 * 固定 catalog/detail/scores/library 数据、固定 insets 与窗口尺寸、
 * InteractionManager 同步执行、Animated.loop 静态 mock、
 * useFlowingProgress 固定静态首帧（progress=0 → outputRange[0]）。
 * P2 刚收敛过别名展开，本基线以改造前现状采集。
 */
import { createHash } from 'node:crypto';
import { Animated, Dimensions, InteractionManager } from 'react-native';
import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { PhigrosSongDetail } from '@/components/phigros/PhigrosSongDetail';
import { ChunithmSongDetail } from '@/components/chunithm/ChunithmSongDetail';
import type {
  ChunithmCatalogSnapshot,
  ChunithmSongDetailSnapshot,
} from '@/domain/chunithm';

jest.spyOn(Animated, 'loop').mockReturnValue({
  start: jest.fn(),
  stop: jest.fn(),
  reset: jest.fn(),
} as unknown as ReturnType<typeof Animated.loop>);
jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
  (callback as () => void)();
  return { cancel: jest.fn() } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
});

// 流光动画值固定为静态首帧：progress=0 → translateX 取 outputRange[0]（-width）。
jest.mock('@/components/game-content/use-flowing-progress', () => ({
  useFlowingProgress: () => ({
    interpolate: ({ outputRange }: { outputRange: number[] }) => outputRange[0],
  }),
}));

let mockGameDataPayload: Record<string, unknown> | null = null;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useNavigation: () => ({
    canGoBack: () => true,
    goBack: jest.fn(),
    getState: () => ({ index: 0, routes: [{ name: 'songs/[songId]' }] }),
  }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-image', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Image: ({ source, ...props }: { source?: unknown }) => (
      <RN.Image {...props} source={{ uri: String(source) }} />
    ),
  };
});
jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GestureHandlerRootView: RN.View,
    Pressable: (props: React.ComponentProps<typeof RN.Pressable>) => React.createElement(
      RN.Pressable,
      { ...props, testID: props.testID ?? 'gesture-handler-pressable' },
    ),
    ScrollView: RN.ScrollView,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  dark: false,
  accent: '#246BFD',
  accentSoft: '#EAF1FF',
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF2F7',
  input: '#FFFFFF',
  border: '#D1D5DB',
  text: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#6B7280',
  danger: '#B42318',
}) }));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: { activeGameId: string; activeAccountId: string }) => unknown) => selector({
    activeGameId: 'phigros',
    activeAccountId: 'contract-account',
  }),
}));
jest.mock('@/components/AppNotification', () => ({
  NotificationOutlet: () => null,
  useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }),
  useNotificationModalRequestClose: () => () => false,
}));
jest.mock('@/components/CachedTabScreen', () => ({
  useCachedTabActive: () => true,
}));
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({
    data: { gameId: 'contract', providerId: 'contract', payload: mockGameDataPayload },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

// —— Phigros 详情数据与 hooks（phigros-song-detail.test.tsx 原样）——
jest.mock('@/hooks/use-phigros-catalog', () => ({
  usePhigrosCatalog: () => ({
    data: {
      snapshot: {
        songs: [{
          id: 'Song.A',
          title: '测试曲',
          artist: '测试曲师',
          illustrator: '测试曲绘师',
          version: '3.8.0',
          aliases: ['测试别名一', '测试别名二'],
          charts: [
            {
              songId: 'Song.A', type: 'SD', levelIndex: 0, level: 'EZ', difficulty: 'basic',
              difficultyConstant: 5.5, charter: 'EZ谱师',
              notes: { tap: 10, hold: 20, drag: 30, flick: 40, total: 100 },
            },
            {
              songId: 'Song.A', type: 'SD', levelIndex: 1, level: 'HD', difficulty: 'advanced',
              difficultyConstant: 10.2, charter: 'HD谱师',
              notes: { tap: 50, hold: 60, drag: 70, flick: 80, total: 260 },
            },
            {
              songId: 'Song.A', type: 'SD', levelIndex: 2, level: 'IN', difficulty: 'expert',
              difficultyConstant: 14.8, charter: 'IN谱师',
              notes: { tap: 100, hold: 110, drag: 120, flick: 130, total: 460 },
            },
            {
              songId: 'Song.A', type: 'SD', levelIndex: 3, level: 'AT', difficulty: 'master',
              difficultyConstant: 15.9, charter: 'AT谱师',
            },
          ],
        }],
        source: { kind: 'generated', label: 'Phigros3.8.0', updatedAt: '2026-07-20T00:00:00.000Z', isStale: false },
      },
      provider: {
        getIllustrationUrl: (id: string) => `https://example.com/${id}.png`,
        getIllustrationBlurUrl: (id: string) => `https://example.com/blur/${id}.png`,
        getIllustrationLowresUrl: (id: string) => `https://example.com/lowres/${id}.png`,
      },
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-phigros-kyou', () => ({
  usePhigrosKyouChartTags: () => ({
    data: {
      songs: [{ songId: 'kyou-song', name: '测试曲', pack: '3.8.0' }],
      charts: [{
        chartId: 'kyou-song_in', songId: 'kyou-song', songName: '测试曲', difficulty: 'in',
        constant: 14.8, mainLabel: '读谱', mainLabelQuestion: false,
        mainTopVotes: 8, mainSecondVotes: 0, tagSource: 'Kyou',
      }],
      tags: [
        { id: 152, name: '读谱', type: 'primary', parentIds: [], description: '读谱相关难点' },
        { id: 153, name: '协调', type: 'primary', parentIds: [], description: '协调相关难点' },
        { id: 154, name: '耐力', type: 'primary', parentIds: [], description: '耐力相关难点' },
        { id: 155, name: '手速', type: 'primary', parentIds: [], description: '手速相关难点' },
        { id: 159, name: '多指', type: 'primary', parentIds: [], description: '多指相关难点' },
        { id: 156, name: '差速', type: 'secondary', parentIds: [152], description: '速度不同' },
        { id: 157, name: '脑裂', type: 'secondary', parentIds: [152], description: '多线配置' },
        { id: 158, name: '扫线', type: 'secondary', parentIds: [152], description: '扫线配置' },
        { id: 160, name: '交互', type: 'secondary', parentIds: [153], description: '交互配置' },
        { id: 161, name: '纵连', type: 'secondary', parentIds: [154], description: '纵连配置' },
        { id: 162, name: '被截断项', type: 'secondary', parentIds: [155], description: '不会进入前五' },
      ],
      votes: [
        { chartId: 'kyou-song_in', songId: 'kyou-song', songName: '测试曲', difficulty: 'in', tagType: 'primary', tagId: 152, tag: '读谱', votes: 30, parentIds: [], source: 'Kyou' },
        { chartId: 'kyou-song_in', songId: 'kyou-song', songName: '测试曲', difficulty: 'in', tagType: 'primary', tagId: 154, tag: '耐力', votes: 20, parentIds: [], source: 'Kyou' },
        { chartId: 'kyou-song_in', songId: 'kyou-song', songName: '测试曲', difficulty: 'in', tagType: 'primary', tagId: 153, tag: '协调', votes: 20, parentIds: [], source: 'Kyou' },
        { chartId: 'kyou-song_in', songId: 'kyou-song', songName: '测试曲', difficulty: 'in', tagType: 'primary', tagId: 155, tag: '手速', votes: 15, parentIds: [], source: 'Kyou' },
        { chartId: 'kyou-song_in', songId: 'kyou-song', songName: '测试曲', difficulty: 'in', tagType: 'primary', tagId: 159, tag: '多指', votes: 15, parentIds: [], source: 'Kyou' },
        { chartId: 'kyou-song_in', songId: 'kyou-song', songName: '测试曲', difficulty: 'in', tagType: 'secondary', tagId: 156, tag: '差速', votes: 10, parentIds: [152], source: 'Kyou' },
        { chartId: 'kyou-song_in', songId: 'kyou-song', songName: '测试曲', difficulty: 'in', tagType: 'secondary', tagId: 157, tag: '脑裂', votes: 9, parentIds: [152], source: 'Kyou' },
        { chartId: 'kyou-song_in', songId: 'kyou-song', songName: '测试曲', difficulty: 'in', tagType: 'secondary', tagId: 158, tag: '扫线', votes: 8, parentIds: [152], source: 'Kyou' },
        { chartId: 'kyou-song_in', songId: 'kyou-song', songName: '测试曲', difficulty: 'in', tagType: 'secondary', tagId: 160, tag: '交互', votes: 7, parentIds: [153], source: 'Kyou' },
        { chartId: 'kyou-song_in', songId: 'kyou-song', songName: '测试曲', difficulty: 'in', tagType: 'secondary', tagId: 161, tag: '纵连', votes: 6, parentIds: [154], source: 'Kyou' },
        { chartId: 'kyou-song_in', songId: 'kyou-song', songName: '测试曲', difficulty: 'in', tagType: 'secondary', tagId: 162, tag: '被截断项', votes: 5, parentIds: [155], source: 'Kyou' },
      ],
      source: { kind: 'kyou', label: 'Kyou Phigros 谱面标签', updatedAt: '2026-08-09T00:00:00.000Z', isStale: false },
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

// —— Chunithm 详情数据与 hooks（chunithm-song-detail.test.tsx 原样）——
const chunithmSource = {
  kind: 'lxns' as const,
  label: 'LXNS 中二节奏公共曲库',
  updatedAt: '2026-07-28T00:00:00.000Z',
  isStale: false,
};
const chunithmSong = {
  id: 3,
  title: 'B.B.K.K.B.K.K.',
  artist: 'nora2r',
  genre: '其他游戏',
  bpm: 170,
  map: '未来都市',
  rights: 'TEST RIGHTS',
  aliases: ['bbkkbkk', 'bk'],
  versionId: 23000,
  versionTitle: 'CHUNITHM VERSE',
  locked: false,
  disabled: false,
  difficulties: [
    {
      difficulty: 0 as const,
      level: '3',
      levelValue: 3,
      noteDesigner: 'Basic Designer',
      versionId: 23000,
      versionTitle: 'CHUNITHM VERSE',
      notes: { total: 333, tap: 219, hold: 24, slide: 48, air: 42, flick: 0 },
    },
    {
      difficulty: 3 as const,
      level: '12+',
      levelValue: 12.5,
      noteDesigner: 'Master Designer',
      versionId: 23000,
      versionTitle: 'CHUNITHM VERSE',
      notes: { total: 960, tap: 521, hold: 101, slide: 135, air: 57, flick: 146 },
    },
    {
      difficulty: 4 as const,
      level: '13+',
      levelValue: 13.7,
      noteDesigner: 'Ultima Designer',
      versionId: 23000,
      versionTitle: 'CHUNITHM VERSE',
      notes: { total: 1626, tap: 893, hold: 118, slide: 392, air: 124, flick: 99 },
    },
    {
      difficulty: 5 as const,
      level: '0',
      levelValue: 0,
      noteDesigner: 'WE Designer',
      versionId: 22000,
      versionTitle: 'CHUNITHM LUMINOUS PLUS',
      originId: 163,
      kanji: '止',
      star: 1,
      notes: { total: 1244, tap: 606, hold: 319, slide: 209, air: 110, flick: 0 },
    },
  ],
};
const chunithmCatalog: ChunithmCatalogSnapshot = {
  currentVersion: { id: 23000, title: 'CHUNITHM VERSE' },
  versions: [{ id: 23000, title: 'CHUNITHM VERSE' }],
  genres: [{ id: 1, title: '其他游戏' }],
  songs: [chunithmSong],
  source: chunithmSource,
};
const chunithmDetail: ChunithmSongDetailSnapshot = {
  song: chunithmSong,
  source: {
    ...chunithmSource,
    label: 'LXNS 中二节奏单曲详情',
    updatedAt: '2026-07-28T01:00:00.000Z',
  },
};
// 工厂闭包延迟读取（渲染时 const 已初始化），变量名以 mock 开头满足 jest hoist 限制
let mockChunithmCatalogData: ChunithmCatalogSnapshot | null = null;
let mockChunithmDetailData: ChunithmSongDetailSnapshot | null = null;
jest.mock('@/hooks/use-chunithm-catalog', () => ({
  useChunithmCatalog: () => ({
    data: mockChunithmCatalogData,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-chunithm-song-detail', () => ({
  useChunithmSongDetail: () => ({
    data: mockChunithmDetailData,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-user-library', () => {
  const { chartLibraryKey, songLibraryKey } = jest.requireActual<typeof import('../src/domain/user-library')>('../src/domain/user-library');
  return {
    useUserLibrary: () => ({
      data: [],
      isLoading: false,
      isUpdating: false,
      setSongFavorite: jest.fn(),
      setChartPractice: jest.fn(),
      setTags: jest.fn(),
      setTagPresets: jest.fn(),
      tagPresets: ['爆发'],
      songKey: (songId: string | number) => songLibraryKey('phigros', songId),
      chartKey: (songId: string | number, type: 'SD' | 'DX', levelIndex: number) => chartLibraryKey('phigros', songId, type, levelIndex),
    }),
  };
});
jest.mock('@/components/TagEditor', () => ({
  TagEditor: ({ tags }: { tags: string[] }) => {
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <RN.View>
        <RN.Text>谱面标签：{tags.join('、') || '无'}</RN.Text>
      </RN.View>
    );
  },
}));

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

beforeEach(() => {
  Dimensions.set({ window: { width: 390, height: 844, scale: 1, fontScale: 1 } });
  mockChunithmCatalogData = chunithmCatalog;
  mockChunithmDetailData = chunithmDetail;
  mockGameDataPayload = null;
});

test('phigros song detail full page host tree contract', async () => {
  mockGameDataPayload = {
    kind: 'phigros',
    records: [{
      songId: 'Song.A', title: 'Song.A', type: 'SD', levelIndex: 2, level: 'IN',
      difficulty: 'expert', difficultyConstant: 14.8, achievements: 99.5, dxScore: 980_000,
      rating: 14.2, fc: null, fs: null, rate: 'v', version: 'current',
    }],
    source: { kind: 'generated', label: 'TapTap云存档', updatedAt: '2026-07-20T01:00:00.000Z', isStale: false },
  };
  const screen = await render(<PhigrosSongDetail songId="Song.A" />);
  const tree = screen.toJSON();
  const canonical = canonicalize(tree);
  const hash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  expect(hash).toBe('8d38290016f49ebb876d54652d5553380beee2dfb1c0bf853532c4e6b678582d');
});

test('chunithm song detail full page host tree contract', async () => {
  mockGameDataPayload = {
    kind: 'chunithm',
    scores: [{
      id: 3,
      song_name: chunithmSong.title,
      level: '12+',
      level_index: 3,
      score: 1_009_000,
      rating: 15.25,
      over_power: 98.12,
      clear: 'clear',
      full_combo: 'alljustice',
      full_chain: null,
    }],
    source: { ...chunithmSource, label: '落雪咖啡屋' },
    hasSyncedData: true,
  };
  const screen = await render(<ChunithmSongDetail songId="3" />);
  const tree = screen.toJSON();
  const canonical = canonicalize(tree);
  const hash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  expect(hash).toBe('dd629c75286968d575c0ca41ff88b56a81252415db4c77041799f8f23e6af967');
});

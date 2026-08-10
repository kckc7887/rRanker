import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StyleSheet, View } from 'react-native';
import { MuseDashAccValue } from '@/components/musedash/MuseDashAccValue';
import type { MuseDashAlbumsResponse, MuseDashCeResponse, MuseDashPlayer } from '@/domain/muse-dash';
import {
  MuseDashBestScreen,
  MuseDashCatalogScreen,
  MuseDashRecordsScreen,
  MuseDashSongDetailScreen,
} from '@/screens/MuseDashScreens';

const mockRefetch = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
let mockPlayer: MuseDashPlayer | undefined;
let mockAlbums: MuseDashAlbumsResponse | undefined;
let mockCe: MuseDashCeResponse | undefined;
const mockDiffdiff = [
  ['0-47', 3, '11', 640.1, 11.5],
  ['0-47', 4, '12', 739.7, 12.5],
] as [string, number, string, number, number][];
const mockSetChartPractice = jest.fn();
const mockSetTags = jest.fn();
let mockMissMap: ReadonlyMap<string, number | undefined> = new Map();

function mockGetQueryData(key: unknown): { data: { play: { miss: number } }; source: object } | undefined {
  const parts = key as readonly unknown[];
  if (!Array.isArray(parts) || parts[0] !== 'musedash' || parts[1] !== 'play-detail') return undefined;
  const miss = mockMissMap.get(`${String(parts[3])}:${String(parts[4])}`);
  return miss === undefined ? undefined : { data: { play: { miss } }, source: {} };
}

jest.mock('expo-router', () => ({
  router: { push: () => undefined },
  useNavigation: () => ({ canGoBack: () => mockCanGoBack(), goBack: () => mockBack() }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GestureHandlerRootView: RN.View,
    Pressable: RN.Pressable,
    ScrollView: RN.ScrollView,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/hooks/use-debounced-value', () => ({ useDebouncedValue: (value: unknown) => value }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  background: '#F7F8FA', surface: '#FFF', surfaceMuted: '#EEF2F7', border: '#DDD', text: '#111',
  textSecondary: '#4B5563', textMuted: '#666', accent: '#246BFD', accentSoft: '#E8F0FF', dark: false,
}) }));
jest.mock('@/state/session-store', () => ({ useSession: (selector: (state: unknown) => unknown) => selector({
  activeAccountId: 'musedash:musedash-moe:6ea4f986ffd211e8aa980242ac110011',
  activeGameId: 'musedash',
}) }));
jest.mock('@/hooks/use-muse-dash', () => {
  const query = (data: unknown) => ({
    data, source: { kind: 'musedash', label: 'MuseDash.moe', updatedAt: '2026-08-10T00:00:00.000Z', isStale: false },
    isLoading: false, isError: false, error: null, isFetching: false, refetch: mockRefetch,
  });
  return {
    useMuseDashPlayer: () => query(mockPlayer),
    useMuseDashAlbums: () => query(mockAlbums),
    useMuseDashCe: () => query(mockCe),
    useMuseDashDiffdiff: () => query(mockDiffdiff),
    useMuseDashPlayDetail: () => query(undefined),
  };
});
jest.mock('@/state/query-client', () => ({
  queryClient: {
    getQueryData: (key: unknown) => mockGetQueryData(key),
    getQueryCache: () => ({ subscribe: () => () => undefined }),
  },
}));
jest.mock('@/hooks/use-user-library', () => {
  const { chartLibraryKey, songLibraryKey } = jest.requireActual<typeof import('../src/domain/user-library')>('../src/domain/user-library');
  const state: { data: unknown[] } = { data: [] };
  return {
    __libraryMockState: state,
    useUserLibrary: () => ({
      data: state.data,
      isLoading: false,
      isUpdating: false,
      setSongFavorite: jest.fn(),
      setChartPractice: (...args: unknown[]) => mockSetChartPractice(...args),
      setTags: (...args: unknown[]) => mockSetTags(...args),
      setTagPresets: jest.fn(),
      tagPresets: ['爆发', '交互'],
      songKey: (songId: string | number) => songLibraryKey('musedash', songId),
      chartKey: (songId: string | number, type: 'SD' | 'DX', levelIndex: number) => chartLibraryKey('musedash', songId, type, levelIndex),
    }),
  };
});
jest.mock('@/components/TagEditor', () => ({
  TagEditor: ({ onChange }: { onChange?: (tags: string[]) => void }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return React.createElement(RN.Pressable, {
      accessibilityRole: 'button',
      accessibilityLabel: '编辑标签',
      onPress: () => onChange?.(['测试标签']),
    });
  },
}));
jest.mock('@/components/CachedTabScreen', () => ({
  useCachedTabActive: () => true,
}));

const albums: MuseDashAlbumsResponse = {
  ALBUM1: {
    title: 'Default Music', json: 'ALBUM1', tag: 'Default',
    music: {
      '0-47': {
        uid: '0-47', name: 'Sample Song', author: 'Sample Author', cover: 'sample_cover',
        bpm: '128', levelDesigner: ['Mapper A'], difficulty: ['2', '5', '8', '11', '12'],
        ChineseS: { name: '示例歌曲', author: '示例作者' },
      },
      '0-48': {
        uid: '0-48', name: 'Unplayed Song', author: 'Silent Author', cover: 'unplayed_cover',
        bpm: '90', levelDesigner: ['Mapper B'], difficulty: ['1', '0', '0', '0', '0'],
        ChineseS: { name: '未游玩歌曲', author: '沉默作者' },
      },
    },
  },
  ALBUM2: {
    title: 'Second Album', json: 'ALBUM2', tag: 'Pack',
    music: {
      '1-1': {
        uid: '1-1', name: 'Another Track', author: 'Another Author', cover: 'another_cover',
        bpm: '140', levelDesigner: ['Mapper C'], difficulty: ['1', '0', '0', '0', '0'],
      },
    },
  },
};

const ce: MuseDashCeResponse = {
  c: { ChineseS: ['凛·贝斯手', '凛·问题少女', '凛·主唱', '凛·治愈者', '布若'], English: [] },
  e: { ChineseS: ['喵斯', '安吉拉', '塔纳托斯', 'Rabot-233', '莉莉丝', '乌瑞尔', '未命名', '厄普西隆'], English: [] },
};

const player: MuseDashPlayer = {
  lastUpdate: 1786311369798, rl: 3.4518686005869577, diffHistoryNumber: 11,
  plays: [
    { score: 302027, acc: 94.17, i: 1950, platform: 'mobile', history: { lastRank: 1949 }, difficulty: 2, uid: '1-1', sum: 3950, character_uid: '11', elfin_uid: '7' },
    { score: 194166, acc: 97.31, i: 664, platform: 'mobile', history: { lastRank: 664 }, difficulty: 1, uid: '0-47', sum: 1865, character_uid: '7', elfin_uid: '6' },
    { score: 290510, acc: 95.48, i: 1846, platform: 'pc', history: { lastRank: 1845 }, difficulty: 3, uid: '0-47', sum: 3846, character_uid: '3', elfin_uid: '6' },
  ],
  user: { user_id: '6ea4f986ffd211e8aa980242ac110011', nickname: 'SiMOOOOOON' },
};

function collectLeafTexts(node: unknown): string[] {
  const result: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      result.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === 'object') {
      const element = value as { props?: { children?: unknown }; children?: unknown };
      const children = element.children ?? element.props?.children;
      if (typeof children === 'string') {
        result.push(children);
        return;
      }
      if (children) walk(children);
    }
  };
  walk(node);
  return result;
}

describe('Muse Dash screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayer = player;
    mockAlbums = albums;
    mockCe = ce;
    mockMissMap = new Map();
  });  it('orders the Best list by community rating (sum) descending with ACC-led cards', async () => {
    const screen = await render(<MuseDashBestScreen />);
    expect(screen.getAllByLabelText(/^查看谱面/).map((node) => node.props.accessibilityLabel)[0])
      .toContain('Another Track');
    expect(screen.getAllByTestId('musedash-score-0-47-3').length).toBe(1);
    expect(screen.getAllByTestId('musedash-score-1-1-2').length).toBe(1);
    expect(screen.getAllByText('95.48%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('HIDDEN (11.50)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rating').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('musedash-card-tags-0-47-3').length).toBe(1);
  });

  it('lays out card tags in two rows: difficulty/grade/achievement/rank then character/elfin/platform', async () => {
    mockPlayer = {
      ...player,
      plays: player.plays.map((play) =>
        play.uid === '0-47' && play.difficulty === 3 ? { ...play, i: 9 } : play),
    };
    const screen = await render(<MuseDashBestScreen />);
    const tags = screen.getByTestId('musedash-card-tags-0-47-3');
    expect(tags.children).toHaveLength(2);
    const row1 = collectLeafTexts(tags.children[0]).join(' ');
    const row2 = collectLeafTexts(tags.children[1]).join(' ');
    expect(row1).toContain('HIDDEN');
    expect(row1.indexOf('S')).toBeGreaterThan(row1.indexOf('HIDDEN'));
    expect(row1.indexOf('#9')).toBeGreaterThan(row1.indexOf('S'));
    expect(row2).toBe('凛·治愈者 未命名 PC 端');
  });

  it('filters records by difficulty, DLC and constant range with fixed Rating order', async () => {
    const screen = await render(<MuseDashRecordsScreen />);
    expect(screen.getAllByTestId(/^musedash-score-/)).toHaveLength(3);
    await fireEvent.press(screen.getByLabelText('难度筛选，当前 全部'));
    await fireEvent.press(screen.getByLabelText('选择难度 HIDDEN'));
    expect(screen.getAllByTestId(/^musedash-score-/)).toHaveLength(1);
    expect(screen.getAllByTestId('musedash-score-0-47-3').length).toBe(1);
    await fireEvent.press(screen.getByLabelText('难度筛选，当前 HIDDEN'));
    await fireEvent.press(screen.getByLabelText('选择难度 全部'));
    await fireEvent.press(screen.getByLabelText('DLC筛选，当前 全部'));
    await fireEvent.press(screen.getByLabelText('选择DLC Second Album'));
    expect(screen.getAllByTestId(/^musedash-score-/)).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText('DLC筛选，当前 Second Album'));
    await fireEvent.press(screen.getByLabelText('选择DLC 全部'));
    await fireEvent.changeText(screen.getByLabelText('最低定数'), '9');
    expect(screen.getAllByTestId(/^musedash-score-/)).toHaveLength(1);
    expect(screen.getAllByTestId('musedash-score-0-47-3').length).toBe(1);
    expect(screen.queryAllByTestId('musedash-score-0-47-1')).toHaveLength(0);
    const labels = screen.getAllByLabelText(/^查看谱面/).map((node) => node.props.accessibilityLabel);
    expect(labels[0]).toContain('ACC 95.48%');
  });

  it('filters records by ACC range and keeps Rating order', async () => {
    const screen = await render(<MuseDashRecordsScreen />);
    await fireEvent.changeText(screen.getByLabelText('最低达成率'), '97');
    expect(screen.getAllByTestId(/^musedash-score-/)).toHaveLength(1);
    expect(screen.getAllByTestId('musedash-score-0-47-1').length).toBe(1);
  });

  it('filters records by FC/AP achievement using requested miss counts', async () => {
    mockPlayer = {
      ...player,
      plays: player.plays.map((play) =>
        play.uid === '0-47' && play.difficulty === 3 ? { ...play, acc: 100 } : play),
    };
    mockMissMap = new Map([['0-47:3', 0], ['0-47:1', 2], ['1-1:2', 0]]);
    const screen = await render(<MuseDashRecordsScreen />);
    await fireEvent.press(screen.getByLabelText('成就筛选，当前 全部'));
    await fireEvent.press(screen.getByLabelText('选择成就 FC'));
    expect(screen.getAllByTestId(/^musedash-score-/)).toHaveLength(2);
    expect(screen.queryAllByTestId('musedash-score-0-47-1')).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText('成就筛选，当前 FC'));
    await fireEvent.press(screen.getByLabelText('选择成就 AP'));
    expect(screen.getAllByTestId(/^musedash-score-/)).toHaveLength(1);
    expect(screen.getAllByTestId('musedash-score-0-47-3').length).toBe(1);
    await fireEvent.press(screen.getByLabelText('成就筛选，当前 AP'));
    await fireEvent.press(screen.getByLabelText('选择成就 全部'));
    expect(screen.getAllByTestId(/^musedash-score-/)).toHaveLength(3);
  });

  it('searches records by song title and uid', async () => {
    const screen = await render(<MuseDashRecordsScreen />);
    await fireEvent.changeText(screen.getByLabelText('筛选喵斯快跑成绩'), '示例');
    expect(screen.getAllByTestId(/^musedash-score-/)).toHaveLength(2);
    await fireEvent.changeText(screen.getByLabelText('筛选喵斯快跑成绩'), '1-1');
    expect(screen.getAllByTestId(/^musedash-score-/)).toHaveLength(1);
  });

  it('filters the catalog by difficulty, DLC and constant range and searches songs', async () => {
    const screen = await render(<MuseDashCatalogScreen />);
    expect(screen.getAllByLabelText(/^打开歌曲/)).toHaveLength(3);
    expect(screen.getAllByText('11.50').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByLabelText('难度筛选，当前 全部'));
    await fireEvent.press(screen.getByLabelText('选择难度 HIDDEN'));
    expect(screen.getAllByLabelText(/^打开歌曲/)).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText('难度筛选，当前 HIDDEN'));
    await fireEvent.press(screen.getByLabelText('选择难度 全部'));
    await fireEvent.press(screen.getByLabelText('DLC筛选，当前 全部'));
    await fireEvent.press(screen.getByLabelText('选择DLC Second Album'));
    expect(screen.getAllByLabelText(/^打开歌曲/)).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText('DLC筛选，当前 Second Album'));
    await fireEvent.press(screen.getByLabelText('选择DLC 全部'));
    await fireEvent.changeText(screen.getByLabelText('最低定数'), '12');
    expect(screen.getAllByLabelText(/^打开歌曲/)).toHaveLength(1);
    await fireEvent.changeText(screen.getByLabelText('最低定数'), '');
    await fireEvent.changeText(screen.getByLabelText('搜索喵斯快跑歌曲'), 'Another');
    expect(screen.getAllByLabelText(/^打开歌曲/)).toHaveLength(1);
  });

  it('renders detail hero, metadata, difficulty carousel with practice and tags', async () => {
    const screen = await render(<MuseDashSongDetailScreen songId="0-47" />);
    expect(screen.getByTestId('musedash-chart-0')).toBeTruthy();
    expect(screen.getByTestId('musedash-chart-4')).toBeTruthy();
    expect(screen.getByTestId('musedash-song-title-scroll').props.horizontal).toBe(true);
    expect(screen.getByText('DLC 来源')).toBeTruthy();
    expect(screen.getByTestId('musedash-song-metadata-value-DLC 来源').props.children).toBe('Default Music');
    expect(screen.getByText('BPM')).toBeTruthy();
    expect(screen.getByText('MuseDash.moe', { exact: false })).toBeTruthy();
    expect(screen.getAllByText('95.48%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('HIDDEN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('谱师：Mapper A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('加入练习清单').length).toBe(5);
    expect(screen.getAllByLabelText(/.+难度卡片$/).map((node) => node.props.accessibilityLabel)).toEqual([
      'EX 难度卡片', 'HIDDEN 难度卡片', 'MASTER 难度卡片', 'HARD 难度卡片', 'EASY 难度卡片',
    ]);
    await fireEvent.press(screen.getAllByLabelText('加入练习清单')[1]);
    expect(mockSetChartPractice).toHaveBeenCalledWith('0-47', 'SD', 3, true);
    await fireEvent.press(screen.getAllByLabelText('编辑标签')[1]);
    expect(mockSetTags).toHaveBeenCalledWith(
      { kind: 'chart', songId: '0-47', type: 'SD', levelIndex: 3 },
      ['测试标签'],
    );
  });

  it('renders an unplayed difficulty card with a dash ACC', async () => {
    const screen = await render(<MuseDashSongDetailScreen songId="0-48" />);
    expect(screen.getByTestId('musedash-chart-0')).toBeTruthy();
    expect(screen.queryByTestId('musedash-chart-4')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('colors ACC by band: metal gradients at/above 90 and white below', async () => {
    const screen = await render(<View>
      <MuseDashAccValue acc={88} />
      <MuseDashAccValue acc={90} />
      <MuseDashAccValue acc={95} />
      <MuseDashAccValue acc={100} />
    </View>);
    const white = screen.getByLabelText('88.00%');
    expect(StyleSheet.flatten(white.props.style)).toMatchObject({ color: '#FFFFFF', fontSize: 28 });
    expect(screen.getByTestId('musedash-acc-gradient-red').props.accessibilityLabel).toBe('90.00%');
    expect(screen.getByTestId('musedash-acc-gradient-silver').props.accessibilityLabel).toBe('95.00%');
    expect(screen.getByTestId('musedash-acc-gradient-gold').props.accessibilityLabel).toBe('100.00%');
  });

  it('shows a back button that navigates back when possible', async () => {
    const screen = await render(<MuseDashSongDetailScreen songId="0-47" />);
    await fireEvent.press(screen.getByLabelText('返回'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

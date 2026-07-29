import { fireEvent, render, waitFor, within } from './render-with-query';
import { jest } from '@jest/globals';
import { Animated, InteractionManager, Platform } from 'react-native';
import { SearchScreen } from '../app/(tabs)/search';
import SongDetailScreen from '../app/songs/[songId]';
import { useCatalogFilter } from '@/state/catalog-filter';
import { useGameFilters } from '@/state/game-filters';

jest.spyOn(Animated, 'loop').mockReturnValue({
  start: jest.fn(), stop: jest.fn(), reset: jest.fn(),
} as unknown as ReturnType<typeof Animated.loop>);
jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
  (callback as () => void)();
  return { cancel: jest.fn() } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
});

const mockSetSongFavorite = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockStackScreen = jest.fn((_props: unknown) => null);
let mockSongRouteParams: { songId: string; chartType?: string; levelIndex?: string } = { songId: '1' };
let mockDetailedCatalogAvailable = true;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
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
  ...(jest.requireActual('react-native-safe-area-context') as object),
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: (props: unknown) => mockStackScreen(props) },
  router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() },
  useLocalSearchParams: () => mockSongRouteParams,
}));
jest.mock('@/components/SongCover', () => ({ SongCover: () => null }));
jest.mock('@/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => {
  const fixtures = jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized');
  const utageSong = {
    id: '100123',
    title: '協 U·TA·GE',
    artist: '测试曲师',
    aliases: [],
    version: '舞萌DX 2026',
    versionId: 25500,
    charts: [{
      songId: '100123',
      type: 'UTAGE',
      levelIndex: 0,
      level: '14+?',
      difficulty: 'utage',
      difficultyConstant: 0,
      charter: '協谱师',
      versionId: 25500,
      utage: { kanji: '協', description: '两人协力', isBuddy: true },
      notes: {
        left: { tap: 51, hold: 10, slide: 20, touch: 10, break: 10, total: 101 },
        right: { tap: 52, hold: 10, slide: 20, touch: 10, break: 10, total: 102 },
      },
    }],
  };
  const data = { ...fixtures.fixtureCatalog,
    versions: [...fixtures.fixtureCatalog.versions, { id: 25500, title: '舞萌DX 2026' }],
    songs: [...fixtures.fixtureCatalog.songs.map((song: { id: string }) => song.id === '1' ? {
    ...song, aliases: ['唯一别名', '这是用于验证超出一行后才会出现展开按钮的很长很长别名'], version: '舞萌DX 2026', versionId: undefined,
    genre: 'POPS＆ANIME', bpm: 180, region: '未来都市',
    charts: [
      { songId: '1', type: 'DX', levelIndex: 0, level: '6', difficulty: 'basic', difficultyConstant: 6.0 },
      { songId: '1', type: 'DX', levelIndex: 1, level: '9', difficulty: 'advanced', difficultyConstant: 9.0 },
      { songId: '1', type: 'DX', levelIndex: 2, level: '12', difficulty: 'expert', difficultyConstant: 12.0 },
      { songId: '1', type: 'DX', levelIndex: 3, level: '13+', difficulty: 'master', difficultyConstant: 13.6,
        charter: 'DX主谱师', versionId: 25500,
        notes: { tap: 500, hold: 100, slide: 120, touch: 80, break: 20, total: 820 } },
      { songId: '1', type: 'DX', levelIndex: 4, level: '14+', difficulty: 'remaster', difficultyConstant: 14.7 },
      { songId: '1', type: 'SD', levelIndex: 0, level: '5', difficulty: 'basic', difficultyConstant: 5.0, charter: 'SD基础谱师' },
      { songId: '1', type: 'SD', levelIndex: 3, level: '12+', difficulty: 'master', difficultyConstant: 12.8, charter: 'SD主谱师' },
    ],
  } : song), utageSong] };
  return {
    data: mockDetailedCatalogAvailable ? data : undefined,
    isLoading: !mockDetailedCatalogAvailable,
    isError: false,
    error: null,
    refetch: jest.fn(),
  };
} }));
jest.mock('@/hooks/use-score-snapshot', () => ({ useScoreSnapshot: () => {
  const fixtures = jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized');
  const base = fixtures.fixtureRecords[0];
  const visualRecords = [
    { ...base, songId: '1', levelIndex: 0, difficulty: 'basic', achievements: 98.5, rating: 100, rate: 'sp', fc: 'fc', fs: 'fs' },
    { ...base, songId: '1', levelIndex: 1, difficulty: 'advanced', achievements: 99, rating: 120, rate: 'ss', fc: 'fcp', fs: 'fs' },
    { ...base, songId: '1', levelIndex: 2, difficulty: 'expert', achievements: 99.5, rating: 140, rate: 'ssp', fc: 'ap', fs: 'fsd' },
    { ...base, songId: '1', levelIndex: 3, difficulty: 'master', achievements: 99.9999, rating: 160, rate: 'sss', fc: 'app', fs: 'fsdp' },
    { ...base, songId: '1', levelIndex: 4, difficulty: 'remaster', achievements: 100.5, rating: 180, rate: 'sssp', fc: null, fs: null },
    { ...base, songId: '100123', title: '協 U·TA·GE', type: 'UTAGE', levelIndex: 0,
      level: '宴', difficulty: 'utage', difficultyConstant: 0, achievements: 101,
      dxScore: 300, rating: 0, rate: 'sssp', fc: 'app', fs: 'fsdp' },
  ];
  return { data: { records: [...fixtures.fixtureRecords, ...visualRecords], source: fixtures.fixtureSource }, isLoading: false, isError: false, error: null, refetch: jest.fn() };
} }));
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => {
  const scoreQuery = jest.requireMock<{ useScoreSnapshot: () => {
    data?: { records?: unknown[]; source?: unknown };
  } }>('@/hooks/use-score-snapshot').useScoreSnapshot();
  const fixtures = jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized');
  const profile = jest.requireActual<typeof import('../src/domain/game-profile')>('../src/domain/game-profile')
    .getGameProfile('maimai');
  return {
    data: {
      gameId: 'maimai',
      providerId: 'diving-fish',
      profile,
      payload: {
        kind: 'maimai',
        player: fixtures.fixturePlayer,
        records: scoreQuery.data?.records ?? [],
        bestSections: [],
        playerScore: {
          label: profile.ratingLabel,
          value: fixtures.fixturePlayer.rating,
          display: String(fixtures.fixturePlayer.rating).padStart(5, '0'),
        },
        currentVersionTitle: fixtures.fixtureCatalog.currentVersion.title,
        unmatchedRecordCount: 0,
        source: scoreQuery.data?.source ?? fixtures.fixtureSource,
        catalogSource: fixtures.fixtureSource,
        snapshot: {},
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    profile,
    activeGameId: 'maimai',
    activeProviderId: 'diving-fish',
    activeAccountId: 'maimai:diving-fish:test',
  };
} }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({
  data: [], isLoading: false, isUpdating: false, setSongFavorite: mockSetSongFavorite, setChartPractice: jest.fn(), setTags: jest.fn(),
  songKey: (songId: string | number) => `maimai:song:${songId}`,
  chartKey: (songId: string | number, type: string, levelIndex: number) => `maimai:chart:${songId}:${type}:${levelIndex}`,
  tagPresets: [], setTagPresets: jest.fn(),
}) }));
jest.mock('@/hooks/use-collections', () => ({ useCollections: () => ({
  data: { items: [], source: { kind: 'fixture', label: 'fixture', updatedAt: new Date(0).toISOString(), isStale: false } },
  isLoading: false, isError: false, error: null, refetch: jest.fn(),
}) }));
jest.mock('@/components/CollectionImage', () => ({ CollectionImage: () => null }));

describe('M2 song query screens', () => {
  beforeEach(() => {
    mockSongRouteParams = { songId: '1' };
    mockDetailedCatalogAvailable = true;
    useCatalogFilter.getState().reset();
    useGameFilters.getState().reset();
    jest.clearAllMocks();
  });

  it('goes back from the song detail chrome button', async () => {
    const screen = await render(<SongDetailScreen />);
    await fireEvent.press(screen.getByLabelText('返回'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('does not dereference catalog source while the detail catalog is unavailable', async () => {
    mockDetailedCatalogAvailable = false;
    const screen = await render(<SongDetailScreen />);
    expect(screen.queryByText('歌曲信息')).toBeNull();
    expect(screen.getByLabelText('返回')).toBeTruthy();
  });

  it('keeps the immersive chrome and shared detail surfaces on Android', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    try {
      const screen = await render(<SongDetailScreen />);
      expect(screen.getByLabelText('返回')).toBeTruthy();
      const stackProps = mockStackScreen.mock.calls.at(-1)?.[0] as {
        options: {
          headerBackVisible?: boolean;
          headerShown?: boolean;
          headerTransparent?: boolean;
        };
      };
      expect(stackProps.options.headerShown).toBe(false);
      expect(stackProps.options.headerBackVisible).toBe(false);
      expect(stackProps.options.headerTransparent).toBe(true);
      expect(screen.getByTestId('game-song-title-scroll')).toBeTruthy();
      expect(screen.getByTestId('game-chart-carousel')).toBeTruthy();
      expect(screen.getByTestId('game-chart-card-maimai:1:SD:3')).toBeTruthy();

      await fireEvent.press(screen.getByLabelText('收藏 正常曲目 A'));
      expect(mockSetSongFavorite).toHaveBeenCalledWith('1', true);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
    }
  });

  it('searches aliases after debounce and supports empty filter state', async () => {
    const screen = await render(<SearchScreen />);
    expect(screen.getByTestId('game-catalog-results-list').props).toEqual(expect.objectContaining({
      contentInsetAdjustmentBehavior: 'automatic',
      initialNumToRender: 8,
      maxToRenderPerBatch: 4,
      updateCellsBatchingPeriod: 50,
      windowSize: 3,
    }));
    await fireEvent.press(screen.getByLabelText(/展开筛选/));
    expect(screen.getByLabelText('定数下限')).toBeTruthy();
    expect(screen.getByLabelText('定数上限')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('歌曲搜索'), '協 U·TA·GE');
    await waitFor(() => expect(screen.getByLabelText('查看歌曲 協 U·TA·GE')).toBeTruthy());
    const utageBadges = within(screen.getByLabelText('查看歌曲 協 U·TA·GE'));
    expect(utageBadges.getByText('協 14+?')).toBeTruthy();
    expect(utageBadges.getByText('U·TA·GE')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('歌曲搜索'), '');
    await waitFor(() => expect(screen.getByText('共 9 首')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('难度筛选：BASIC'));
    expect(screen.getByLabelText('难度筛选：U·TA·GE')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('重置筛选'));
    await fireEvent.press(screen.getByLabelText('类型筛选：SD'));
    const chartBadges = within(screen.getAllByLabelText('查看歌曲 正常曲目 A')[0]);
    expect(chartBadges.getByText('SD')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('歌曲搜索'), '完全不存在');
    await waitFor(() => expect(screen.getByText('筛选结果为空')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('歌曲搜索'), '唯一别名');
    await waitFor(() => expect(screen.getAllByText('正常曲目 A').length).toBeGreaterThan(0));
  });
  it('renders shared song metadata, chart status, notes and local tags', async () => {
    const screen = await render(<SongDetailScreen />);
    expect(screen.getByText('ID 1')).toBeTruthy();
    expect(screen.getByText(/唯一别名/)).toBeTruthy();
    expect(screen.getByText('POPS＆ANIME')).toBeTruthy();
    expect(screen.getAllByText('180').length).toBeGreaterThan(0);
    expect(screen.getByText('未来都市')).toBeTruthy();
    expect(screen.getByText('版本')).toBeTruthy();
    expect(screen.getByText('舞萌DX 2026')).toBeTruthy();
    expect(screen.getByTestId('game-chart-carousel').props.contentOffset.x).toBeGreaterThanOrEqual(0);
    expect(screen.getByLabelText('Re:MASTER 难度卡片')).toBeTruthy();
    expect(screen.getByText('100.5000%')).toBeTruthy();
    expect(screen.getByText('13.6')).toBeTruthy();
    expect(screen.getByText('DX主谱师')).toBeTruthy();
    expect(screen.getAllByLabelText('搜索谱面确认').length).toBeGreaterThan(0);
    const notesTable = within(screen.getAllByLabelText('谱面物量').find(
      (node) => within(node).queryByText('820'),
    )!);
    for (const heading of ['TAP', 'HOLD', 'SLIDE', 'TOUCH', 'BREAK', '总计']) {
      expect(notesTable.getByText(heading)).toBeTruthy();
    }
    for (const value of ['500', '100', '120', '80', '20', '820']) {
      expect(notesTable.getByText(value)).toBeTruthy();
    }
    expect(screen.getByText('SD主谱师')).toBeTruthy();
    expect(screen.getAllByText('本地标签').length).toBeGreaterThan(1);
  });

  it('renders U·TA·GE without Rating calculation and shows separate 1P/2P notes', async () => {
    mockSongRouteParams = { songId: '100123', chartType: 'UTAGE', levelIndex: '0' };
    const screen = await render(<SongDetailScreen />);

    expect(screen.getByTestId('game-chart-card-maimai:100123:UTAGE:0')).toBeTruthy();
    expect(screen.getAllByText('U·TA·GE').length).toBeGreaterThan(0);
    expect(screen.getByText('協 14+?')).toBeTruthy();
    expect(screen.getByText('两人协力')).toBeTruthy();
    expect(screen.getByText('left')).toBeTruthy();
    expect(screen.getByText('right')).toBeTruthy();
    expect(screen.getByText('101')).toBeTruthy();
    expect(screen.getByText('102')).toBeTruthy();
    expect(screen.queryByText(/Rating/)).toBeNull();
  });

  it('opens the chart type and exact difficulty supplied by a score card', async () => {
    mockSongRouteParams = { songId: '1', chartType: 'SD', levelIndex: '0' };
    const screen = await render(<SongDetailScreen />);

    expect(screen.getByText('SD基础谱师')).toBeTruthy();
    expect(screen.getByTestId('game-chart-carousel').props.contentOffset.x).toBeGreaterThan(0);
    expect(screen.getByTestId('game-chart-card-maimai:1:SD:0')).toBeTruthy();
  });
});

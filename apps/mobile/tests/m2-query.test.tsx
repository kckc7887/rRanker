import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Animated, InteractionManager, Platform, processColor, StyleSheet } from 'react-native';
import { SearchScreen } from '../app/(tabs)/search';
import SongDetailScreen from '../app/songs/[songId]';
import { useCatalogFilter } from '@/state/catalog-filter';

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
  return { data: { ...fixtures.fixtureCatalog,
    versions: [...fixtures.fixtureCatalog.versions, { id: 25500, title: '舞萌DX 2026' }],
    songs: fixtures.fixtureCatalog.songs.map((song: { id: string }) => song.id === '1' ? {
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
  } : song) }, isLoading: false, isError: false, error: null, refetch: jest.fn() };
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
  ];
  return { data: { records: [...fixtures.fixtureRecords, ...visualRecords], source: fixtures.fixtureSource }, isLoading: false, isError: false, error: null, refetch: jest.fn() };
} }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({
  data: [], isLoading: false, isUpdating: false, setSongFavorite: mockSetSongFavorite, setChartPractice: jest.fn(), setTags: jest.fn(),
}) }));
jest.mock('@/hooks/use-collections', () => ({ useCollections: () => ({
  data: { items: [], source: { kind: 'fixture', label: 'fixture', updatedAt: new Date(0).toISOString(), isStale: false } },
  isLoading: false, isError: false, error: null, refetch: jest.fn(),
}) }));
jest.mock('@/components/CollectionImage', () => ({ CollectionImage: () => null }));

describe('M2 song query screens', () => {
  beforeEach(() => {
    mockSongRouteParams = { songId: '1' };
    useCatalogFilter.getState().reset();
    jest.clearAllMocks();
  });

  it('goes back from the song detail chrome button', async () => {
    const screen = await render(<SongDetailScreen />);
    await fireEvent.press(screen.getByLabelText('返回'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('keeps the immersive cover and uses native RN pressables throughout Android details', async () => {
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
      expect(screen.queryAllByTestId('gesture-handler-pressable')).toHaveLength(0);

      await fireEvent(screen.getByTestId('metadata-measure-分类'), 'textLayout', {
        nativeEvent: { lines: [{}, {}, {}] },
      });
      await fireEvent.press(screen.getByLabelText('展开分类'));
      expect(screen.getByTestId('metadata-value-分类').props.numberOfLines).toBeUndefined();
      await fireEvent.press(screen.getByLabelText('切换版本名称'));
      expect(screen.getByTestId('metadata-value-版本').props.children).toBe('maimai でらっくす PRiSM PLUS');
      await fireEvent.press(screen.getAllByLabelText('切换为SD谱面')[0]);
      expect(screen.getByText('谱师：SD主谱师')).toBeTruthy();

      await fireEvent.press(screen.getByLabelText('收藏 正常曲目 A'));
      expect(mockSetSongFavorite).toHaveBeenCalledWith('1', true);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
    }
  });

  it('searches aliases after debounce and supports empty filter state', async () => {
    const screen = await render(<SearchScreen />);
    expect(screen.getByTestId('catalog-results-list').props).toEqual(expect.objectContaining({
      contentInsetAdjustmentBehavior: 'automatic',
      initialNumToRender: 8,
      maxToRenderPerBatch: 4,
      updateCellsBatchingPeriod: 50,
      windowSize: 3,
    }));
    await fireEvent.press(screen.getByLabelText(/展开筛选/));
    expect(StyleSheet.flatten(screen.getByLabelText('最低定数').props.style)).toEqual(expect.objectContaining({
      minHeight: 44,
      paddingVertical: 0,
      lineHeight: 20,
      textAlignVertical: 'center',
      includeFontPadding: false,
    }));
    for (const selectedAll of screen.getAllByLabelText('筛选 全部')) {
      expect(StyleSheet.flatten(selectedAll.props.style)).toEqual(expect.objectContaining({
        borderWidth: 2,
        borderRadius: 999,
        padding: 2,
        borderColor: '#246BFD',
      }));
    }
    await fireEvent.press(screen.getByLabelText('筛选难度 BASIC'));
    expect(StyleSheet.flatten(screen.getByLabelText('筛选难度 BASIC').props.style)).toEqual(expect.objectContaining({
      borderWidth: 2,
      borderRadius: 999,
      padding: 2,
      borderColor: '#246BFD',
    }));
    await fireEvent.press(screen.getByLabelText('重置筛选'));
    expect(StyleSheet.flatten(screen.getByLabelText('筛选难度 BASIC').props.style)).toEqual(expect.objectContaining({
      borderColor: 'transparent',
    }));
    await fireEvent.press(screen.getByLabelText('筛选难度 BASIC'));
    await fireEvent.press(screen.getAllByLabelText('筛选 全部')[0]);
    await fireEvent.press(screen.getByLabelText('筛选类型 SD'));
    expect(StyleSheet.flatten(screen.getByLabelText('筛选类型 SD').props.style)).toEqual(expect.objectContaining({
      borderWidth: 2,
      borderRadius: 10,
      padding: 2,
      borderColor: '#246BFD',
    }));
    await fireEvent.press(screen.getAllByLabelText('筛选 全部')[1]);
    const chartBadges = within(screen.getByTestId('song-chart-badges-1'));
    expect(chartBadges.getByText('SD')).toBeTruthy();
    expect(chartBadges.getByText('DX')).toBeTruthy();
    expect(chartBadges.getAllByText(/^(5|12\.8|6|9|12|13\.6|14\.7)$/).map((node) => node.props.children))
      .toEqual(['5', '12.8', '6', '9', '12', '13.6', '14.7']);

    await fireEvent.press(screen.getByLabelText('版本筛选，当前 全部'));
    await fireEvent.press(screen.getByLabelText('版本名称切换为日文'));
    expect(screen.getByLabelText('选择版本 maimai でらっくす PRiSM PLUS')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('选择版本 maimai でらっくす PRiSM PLUS'));
    expect(screen.getByLabelText('版本筛选，当前 maimai でらっくす PRiSM PLUS')).toBeTruthy();
    expect(screen.getAllByText('正常曲目 A').length).toBeGreaterThan(0);

    await fireEvent.changeText(screen.getByLabelText('歌曲搜索'), '完全不存在');
    await waitFor(() => expect(screen.getByText('筛选结果为空')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('歌曲搜索'), '唯一别名');
    await waitFor(() => expect(screen.getAllByText('正常曲目 A').length).toBeGreaterThan(0));
  });
  it('renders song metadata, chart status and source status', async () => {
    const screen = await render(<SongDetailScreen />);
    expect(screen.getByText('歌曲信息')).toBeTruthy();
    expect(screen.getAllByText(/别名：唯一别名/).length).toBeGreaterThan(0);
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByTestId('metadata-value-分类').props.children).toBe('POPS＆ANIME');
    expect(screen.getAllByText('180').length).toBeGreaterThan(0);
    expect(screen.getByTestId('metadata-value-区域').props.children).toBe('未来都市');
    for (const label of ['分类', 'BPM', '版本', '区域']) {
      expect(screen.getByTestId(`metadata-value-${label}`).props.numberOfLines).toBe(2);
    }
    await fireEvent(screen.getByTestId('metadata-measure-分类'), 'textLayout', {
      nativeEvent: { lines: [{}, {}, {}] },
    });
    await fireEvent.press(screen.getByLabelText('展开分类'));
    expect(screen.getByTestId('metadata-value-分类').props.numberOfLines).toBeUndefined();
    await fireEvent.press(screen.getByLabelText('收起分类'));
    expect(screen.getByTestId('metadata-value-分类').props.numberOfLines).toBe(2);
    expect(screen.getByText('版本')).toBeTruthy();
    expect(screen.getByTestId('metadata-value-版本').props.children).toBe('舞萌DX 2026');
    expect(screen.queryByText(/国服|日服/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('切换版本名称'));
    expect(screen.getByTestId('metadata-value-版本').props.children).toBe('maimai でらっくす PRiSM PLUS');
    expect(screen.getByLabelText('切换版本名称')).toBeTruthy();
    expect(screen.getByLabelText('数据来源状态')).toBeTruthy();
    expect(screen.getByTestId('song-detail-scroll').props.directionalLockEnabled).toBeUndefined();
    // 默认 true：从底部卡片上滑时 ScrollView 可接手触摸；勿锁死为 false。
    expect(screen.getByTestId('song-detail-scroll').props.canCancelContentTouches).not.toBe(false);
    expect(screen.getByLabelText('难度卡片').props.directionalLockEnabled).toBe(true);
    expect(screen.getByLabelText('难度卡片').props.contentOffset.x).toBeGreaterThan(0);
    const difficulties = screen.getAllByText(/Re:MASTER|MASTER|EXPERT|ADVANCED|BASIC/).map((node) =>
      Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children);
    expect(difficulties).toEqual(['Re:MASTER', 'MASTER', 'EXPERT', 'ADVANCED', 'BASIC']);
    expect(screen.getByLabelText('100.5000%')).toBeTruthy();
    expect(screen.getByTestId('flowing-achievement')).toBeTruthy();
    expect(screen.getByTestId('rainbow-achievement')).toBeTruthy();
    expect(screen.getByTestId('flowing-achievement-gradient').props.colors).not.toContain('#f0e470');
    expect(screen.getByTestId('rainbow-achievement-gradient').props.colors).not.toContain('#f0e470');
    expect(screen.getByTestId('rainbow-achievement-gradient').props.colors)
      .toEqual(['#FF8A96', '#78E8A0', '#78C8FF', '#A89CF8', '#F08ADE'].map(processColor));
    expect(screen.getByLabelText('99.9999%')).toBeTruthy();
    expect(screen.getByLabelText('99.5000%')).toBeTruthy();
    expect(screen.getByLabelText('99.0000%')).toBeTruthy();
    expect(screen.getByText('AP+')).toBeTruthy();
    expect(screen.getByText('FDX+')).toBeTruthy();
    expect(screen.getByTestId('flowing-status-AP+')).toBeTruthy();
    expect(screen.getByTestId('flowing-status-FDX+')).toBeTruthy();
    expect(screen.getByText('FC')).toBeTruthy();
    expect(screen.getAllByText('FS').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('flowing-status-FS').length).toBeGreaterThan(0);
    expect(screen.queryByText('SYNC')).toBeNull();
    expect(screen.queryByTestId('flowing-status-SYNC')).toBeNull();
    expect(screen.getByText('SSS+')).toBeTruthy();
    expect(screen.getByText('SSS')).toBeTruthy();
    expect(screen.getByText('SS+')).toBeTruthy();
    expect(screen.getByText('SS')).toBeTruthy();
    expect(screen.getByText('S+')).toBeTruthy();
    expect(screen.getByTestId('flowing-rate-SSS+')).toBeTruthy();
    expect(screen.getByTestId('rainbow-rate-SSS')).toBeTruthy();
    expect(screen.getByTestId('flowing-rate-SS+')).toBeTruthy();
    expect(screen.getByTestId('rainbow-rate-SSS').props.colors)
      .toEqual(['#8E2437', '#984D19', '#796515', '#256B39', '#205E7A', '#384181', '#692C7C'].map(processColor));
    expect(screen.getByTestId('flowing-rate-SS+').props.colors)
      .toEqual(['#84530A', '#A46E12', '#765006', '#A46E12', '#84530A'].map(processColor));
    expect(screen.getByTestId('near-miss-badge')).toBeTruthy();
    expect(screen.queryByText(/定数 13\.6/)).toBeNull();
    expect(screen.getByText('13.6')).toBeTruthy();
    expect(screen.getByText('谱师：DX主谱师')).toBeTruthy();
    expect(screen.queryByText('谱师：SD主谱师')).toBeNull();
    expect(screen.queryByText(/谱面版本/)).toBeNull();
    expect(screen.getByLabelText('搜索谱面确认：正常曲目 A DX MASTER 谱面确认')).toBeTruthy();
    const notesTable = within(screen.getByLabelText('谱面物量'));
    for (const heading of ['TAP', 'HOLD', 'SLIDE', 'TOUCH', 'BREAK', '总计']) {
      expect(notesTable.getByText(heading)).toBeTruthy();
    }
    for (const value of ['500', '100', '120', '80', '20', '820']) {
      expect(notesTable.getByText(value)).toBeTruthy();
    }
    expect(screen.getByText('点击物量表，前往达成率与容错计算')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('使用此谱面物量计算容错'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/tools/tolerance',
      params: { tap: '500', hold: '100', slide: '120', touch: '80', break: '20' },
    }));

    expect(screen.getAllByText('·点击切换·')).toHaveLength(5);
    await fireEvent.press(screen.getAllByLabelText('切换为SD谱面')[0]);
    expect(screen.queryByText('谱师：DX主谱师')).toBeNull();
    expect(screen.getByText('谱师：SD主谱师')).toBeTruthy();
    expect(screen.getByLabelText('搜索谱面确认：正常曲目 A SD MASTER 谱面确认')).toBeTruthy();
    expect(screen.getAllByText('·点击切换·')).toHaveLength(2);
    expect(screen.getAllByText(/Re:MASTER|MASTER|EXPERT|ADVANCED|BASIC/).map((node) =>
      Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children))
      .toEqual(['MASTER', 'BASIC']);

    await fireEvent.press(screen.getByLabelText('收藏 正常曲目 A'));
    expect(mockSetSongFavorite).toHaveBeenCalledWith('1', true);

    await fireEvent(screen.getByTestId('alias-overflow-measure'), 'textLayout', { nativeEvent: { lines: [{}, {}] } });
    await fireEvent.press(screen.getByLabelText('展开别名'));
    expect(screen.getByTestId('song-alias-text').props.numberOfLines).toBeUndefined();
    await fireEvent.press(screen.getByLabelText('收起别名'));
    expect(screen.getByTestId('song-alias-text').props.numberOfLines).toBe(1);
  });

  it('opens the chart type and exact difficulty supplied by a score card', async () => {
    mockSongRouteParams = { songId: '1', chartType: 'SD', levelIndex: '0' };
    const screen = await render(<SongDetailScreen />);

    expect(screen.getByText('谱师：SD基础谱师')).toBeTruthy();
    expect(screen.queryByText('谱师：DX主谱师')).toBeNull();
    expect(screen.getByLabelText('难度卡片').props.contentOffset.x).toBeGreaterThan(0);
    expect(screen.getAllByText(/MASTER|BASIC/).map((node) =>
      Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children))
      .toEqual(['MASTER', 'BASIC']);
  });
});

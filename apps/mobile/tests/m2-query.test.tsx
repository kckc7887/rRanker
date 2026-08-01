import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Animated, InteractionManager, Platform, processColor, StyleSheet } from 'react-native';
import { SearchScreen } from '../app/(tabs)/search';
import SongDetailScreen from '../app/songs/[songId]';
import {
  MAIMAI_UTAGE_COLOR,
  MAIMAI_UTAGE_TINT,
} from '@/components/special-difficulty-theme';
import { songDetailScreenOptions } from '@/components/game-content/SongDetailScreenOptions';
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
const mockCanGoBack = jest.fn(() => true);
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockShowActionNotification = jest.fn();
let mockSongRouteParams: { songId: string; chartType?: string; levelIndex?: string } = { songId: '1' };
let mockDetailedCatalogAvailable = true;
const mockDxRatingTags = Array.from({ length: 14 }, (_, index) => ({
  id: index + 1,
  name: `标签${index + 1}`,
  description: `标签说明${index + 1}`,
  descriptionSegments: [{ text: `标签说明${index + 1}`, strikethrough: index === 1 }],
  color: ['#7dd3fc', '#a5b4fc', '#f0abfc'][index % 3],
  groupId: (index % 3) + 1,
  groupName: ['配置', '难度', '评价'][index % 3],
}));
let mockDxRatingTagCount = 0;
let mockDxRatingTagSongTitle = '正常曲目 A';
let mockDxRatingTagSheetType: 'dx' | 'std' | 'utage' | 'utage2p' = 'dx';
let mockDxRatingTagDifficulty = 'master';
let mockDxRatingTagState: 'live' | 'cache' | 'error' | 'loading' = 'live';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/AppNotification', () => ({
  NotificationOutlet: () => null,
  useNotification: () => ({
    showNotification: jest.fn(),
    showActionNotification: mockShowActionNotification,
  }),
  useNotificationModalRequestClose: () => () => false,
}));
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
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
  useNavigation: () => ({
    canGoBack: () => mockCanGoBack(),
    goBack: () => mockBack(),
  }),
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
  const crossVersionSong = {
    id: '7',
    title: '跨版本双谱面',
    artist: '版本测试曲师',
    aliases: [],
    version: '脱敏过往版本',
    versionId: 1,
    charts: [
      {
        songId: '7', type: 'SD', levelIndex: 3, level: '12+',
        difficulty: 'master', difficultyConstant: 12.8, versionId: 1,
      },
      {
        songId: '7', type: 'DX', levelIndex: 3, level: '13+',
        difficulty: 'master', difficultyConstant: 13.7, versionId: 25500,
      },
    ],
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
      { songId: '1', type: 'SD', levelIndex: 0, level: '5', difficulty: 'basic', difficultyConstant: 5.0,
        charter: 'SD基础谱师', versionId: 1 },
      { songId: '1', type: 'SD', levelIndex: 3, level: '12+', difficulty: 'master', difficultyConstant: 12.8,
        charter: 'SD主谱师', versionId: 1 },
    ],
  } : song), crossVersionSong, utageSong] };
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
jest.mock('@/hooks/use-dxrating-chart-tags', () => ({ useDxRatingChartTags: () => {
  if (mockDxRatingTagState === 'error') {
    return { data: undefined, isLoading: false, isError: true, error: new Error('offline') };
  }
  if (mockDxRatingTagState === 'loading') {
    return { data: undefined, isLoading: true, isError: false, error: null };
  }
  const tags = mockDxRatingTags.slice(0, mockDxRatingTagCount);
  return {
    data: {
      tags,
      relations: tags.map((tag) => ({
        songTitle: mockDxRatingTagSongTitle,
        sheetType: mockDxRatingTagSheetType,
        sheetDifficulty: mockDxRatingTagDifficulty,
        tagId: tag.id,
      })),
      source: {
        kind: mockDxRatingTagState === 'cache' ? 'cache' : 'dxrating',
        label: mockDxRatingTagState === 'cache' ? 'DXRating 谱面标签缓存' : 'DXRating 谱面标签',
        updatedAt: new Date(0).toISOString(),
        isStale: mockDxRatingTagState === 'cache',
      },
    },
    isLoading: false,
    isError: false,
    error: null,
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
    mockDxRatingTagCount = 0;
    mockDxRatingTagSongTitle = '正常曲目 A';
    mockDxRatingTagSheetType = 'dx';
    mockDxRatingTagDifficulty = 'master';
    mockDxRatingTagState = 'live';
    mockCanGoBack.mockReturnValue(true);
    useCatalogFilter.getState().reset();
    jest.clearAllMocks();
  });

  it('goes back from the song detail chrome button', async () => {
    const screen = await render(<SongDetailScreen />);
    await fireEvent.press(screen.getByLabelText('返回'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('returns to the catalog when the detail route has no back history', async () => {
    mockCanGoBack.mockReturnValue(false);
    const screen = await render(<SongDetailScreen />);
    await fireEvent.press(screen.getByLabelText('返回'));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/search');
  });

  it('does not dereference catalog source while the detail catalog is unavailable', async () => {
    mockDetailedCatalogAvailable = false;
    const screen = await render(<SongDetailScreen />);
    expect(screen.queryByText('歌曲信息')).toBeNull();
    expect(screen.getByLabelText('返回')).toBeTruthy();
  });

  it('keeps the immersive cover and uses native RN pressables throughout Android details', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    try {
      const screen = await render(<SongDetailScreen />);
      expect(screen.getByLabelText('返回')).toBeTruthy();
      const screenOptions = songDetailScreenOptions();
      expect(screenOptions.headerShown).toBe(false);
      expect(screenOptions.headerBackVisible).toBe(false);
      expect(screenOptions.headerTransparent).toBe(true);
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

  it.each([0, 1, 4])('renders %i DXRating configuration tags without an overflow control', async (count) => {
    mockDxRatingTagCount = count;
    const screen = await render(<SongDetailScreen />);

    if (count === 0) {
      expect(screen.queryByTestId('dxrating-config-tags')).toBeNull();
      return;
    }
    expect(screen.getByTestId('dxrating-config-tags')).toBeTruthy();
    for (let index = 1; index <= count; index += 1) {
      expect(screen.getByLabelText(`谱面标签 标签${index}，点击查看说明`)).toBeTruthy();
    }
    expect(screen.queryByTestId('dxrating-config-tags-more')).toBeNull();
    expect(screen.queryByText('谱面标签')).toBeNull();
    if (count === 4) {
      expect(StyleSheet.flatten(screen.getByTestId('dxrating-config-tag-1').props.style).backgroundColor).toBe('#7dd3fc');
      expect(StyleSheet.flatten(screen.getByTestId('dxrating-config-tag-2').props.style).backgroundColor).toBe('#a5b4fc');
      expect(StyleSheet.flatten(screen.getByTestId('dxrating-config-tag-3').props.style).backgroundColor).toBe('#f0abfc');
    }
  });

  it('keeps five tags compact, opens all descriptions in one sheet, and keeps individual explanations', async () => {
    mockDxRatingTagCount = 5;
    const screen = await render(<SongDetailScreen />);

    for (let index = 1; index <= 4; index += 1) {
      expect(screen.getByLabelText(`谱面标签 标签${index}，点击查看说明`)).toBeTruthy();
    }
    expect(screen.queryByLabelText('谱面标签 标签5，点击查看说明')).toBeNull();
    expect(screen.getByLabelText('查看全部5个谱面标签，另有1个')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('谱面标签 标签1，点击查看说明'));
    expect(mockShowActionNotification).toHaveBeenCalledWith({
      title: '标签1',
      message: '标签说明1',
      variant: 'info',
      actions: [{ label: '知道了', tone: 'cancel' }],
    });
    await fireEvent.press(screen.getByLabelText('谱面标签 标签2，点击查看说明'));
    expect(mockShowActionNotification).toHaveBeenLastCalledWith({
      title: '标签2',
      message: '标签说明2',
      messageSegments: [{ text: '标签说明2', strikethrough: true }],
      variant: 'info',
      actions: [{ label: '知道了', tone: 'cancel' }],
    });

    await fireEvent.press(screen.getByLabelText('查看全部5个谱面标签，另有1个'));
    expect(screen.getByTestId('dxrating-config-tag-sheet')).toBeTruthy();
    expect(screen.getByText('正常曲目 A · DX · MASTER · 13+')).toBeTruthy();
    for (let index = 1; index <= 5; index += 1) {
      expect(screen.getByText(`标签说明${index}`)).toBeTruthy();
    }
    expect(StyleSheet.flatten(screen.getByTestId('dxrating-tag-description-strikethrough-2-0').props.style))
      .toMatchObject({ textDecorationLine: 'line-through' });
    await fireEvent.press(screen.getByLabelText('关闭谱面标签'));
    expect(screen.queryByTestId('dxrating-config-tag-sheet')).toBeNull();
  });

  it('caps fourteen tags at four and changes them with the chart type', async () => {
    mockDxRatingTagCount = 14;
    const live = await render(<SongDetailScreen />);
    expect(live.getByLabelText('查看全部14个谱面标签，另有10个')).toBeTruthy();
    expect(live.getByText(/DXRating 谱面标签/)).toBeTruthy();

    await fireEvent.press(live.getAllByLabelText('切换为SD谱面')[0]);
    expect(live.queryByTestId('dxrating-config-tags')).toBeNull();
  });

  it('hides tags without blocking details when DXRating is unavailable', async () => {
    mockDxRatingTagState = 'error';
    const failed = await render(<SongDetailScreen />);
    expect(failed.queryByTestId('dxrating-config-tags')).toBeNull();
    expect(failed.getByText('DXRating 谱面标签不可用')).toBeTruthy();
  });

  it('reports a cached DXRating source', async () => {
    mockDxRatingTagState = 'cache';
    const cached = await render(<SongDetailScreen />);
    expect(cached.getByText(/DXRating 谱面标签缓存/)).toBeTruthy();
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
    await fireEvent.changeText(screen.getByLabelText('歌曲搜索'), '協 U·TA·GE');
    await waitFor(() => expect(screen.getByTestId('song-chart-badges-100123')).toBeTruthy());
    const utageBadges = within(screen.getByTestId('song-chart-badges-100123'));
    expect(utageBadges.getByText('協 14+?')).toBeTruthy();
    expect(StyleSheet.flatten(utageBadges.getByTestId('maimai-utage-difficulty-badge').props.style))
      .toMatchObject({
        backgroundColor: MAIMAI_UTAGE_COLOR,
        borderColor: MAIMAI_UTAGE_COLOR,
      });
    expect(utageBadges.queryByText('U·TA·GE')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('歌曲搜索'), '');
    await waitFor(() => expect(screen.getByText('共 10 首')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('歌曲搜索'), '跨版本双谱面');
    await waitFor(() => expect(screen.getByText(
      '版本测试曲师 · SD 脱敏过往版本 · DX 舞萌DX 2026',
    )).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('歌曲搜索'), '');
    await waitFor(() => expect(screen.getByText('共 10 首')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('筛选难度 BASIC'));
    expect(StyleSheet.flatten(screen.getByLabelText('筛选难度 BASIC').props.style)).toEqual(expect.objectContaining({
      borderWidth: 2,
      borderRadius: 999,
      padding: 2,
      borderColor: '#246BFD',
    }));
    expect(screen.getByLabelText('筛选难度 U·TA·GE')).toBeTruthy();
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
    const currentVersionBadges = within(screen.getByTestId('song-chart-badges-7'));
    expect(currentVersionBadges.getByText('DX')).toBeTruthy();
    expect(currentVersionBadges.queryByText('SD')).toBeNull();
    expect(currentVersionBadges.getByText('13.7')).toBeTruthy();
    expect(currentVersionBadges.queryByText('12.8')).toBeNull();
    expect(screen.getByText('版本测试曲师 · maimai でらっくす PRiSM PLUS')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('版本筛选，当前 maimai でらっくす PRiSM PLUS'));
    await fireEvent.press(screen.getByLabelText('选择版本 脱敏过往版本'));
    const pastVersionBadges = within(screen.getByTestId('song-chart-badges-7'));
    expect(pastVersionBadges.getByText('SD')).toBeTruthy();
    expect(pastVersionBadges.queryByText('DX')).toBeNull();
    expect(pastVersionBadges.getByText('12.8')).toBeTruthy();
    expect(pastVersionBadges.queryByText('13.7')).toBeNull();
    expect(screen.getByText('版本测试曲师 · 脱敏过往版本')).toBeTruthy();

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
    await fireEvent(screen.getByTestId('metadata-measure-版本'), 'textLayout', {
      nativeEvent: { lines: [{}, {}, {}] },
    });
    await fireEvent.press(screen.getByLabelText('展开分类'));
    expect(screen.getByTestId('metadata-value-分类').props.numberOfLines).toBeUndefined();
    expect(screen.getByTestId('metadata-value-版本').props.numberOfLines).toBeUndefined();
    await fireEvent.press(screen.getByLabelText('收起分类'));
    expect(screen.getByTestId('metadata-value-分类').props.numberOfLines).toBe(2);
    expect(screen.getByTestId('metadata-value-版本').props.numberOfLines).toBe(2);
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
    expect(screen.getByLabelText('查看谱面确认：正常曲目 A DX MASTER')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('查看谱面确认：正常曲目 A DX MASTER'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/songs/chart-preview',
      params: expect.objectContaining({
        songId: '1',
        chartType: 'DX',
        levelIndex: '3',
        title: '正常曲目 A DX MASTER',
      }),
    }));
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

  it('renders U·TA·GE without Rating calculation and shows separate 1P/2P notes', async () => {
    mockSongRouteParams = { songId: '100123', chartType: 'UTAGE', levelIndex: '0' };
    mockDxRatingTagCount = 1;
    mockDxRatingTagSongTitle = '[協]協 U·TA·GE';
    mockDxRatingTagSheetType = 'utage2p';
    mockDxRatingTagDifficulty = '【協】';
    const screen = await render(<SongDetailScreen />);

    expect(screen.getByText('U·TA·GE')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('maimai-utage-difficulty-badge').props.style))
      .toMatchObject({
        backgroundColor: MAIMAI_UTAGE_COLOR,
        borderColor: MAIMAI_UTAGE_COLOR,
      });
    expect(StyleSheet.flatten(screen.getByTestId('maimai-utage-chart-card').props.style))
      .toMatchObject({
        backgroundColor: MAIMAI_UTAGE_TINT,
        borderColor: MAIMAI_UTAGE_COLOR,
      });
    expect(screen.getByText('協')).toBeTruthy();
    expect(screen.getByText('14+?')).toBeTruthy();
    expect(screen.getByText('两人协力')).toBeTruthy();
    expect(screen.queryByText('DX分数 300')).toBeNull();
    expect(screen.getByText('1P')).toBeTruthy();
    expect(screen.getByText('2P')).toBeTruthy();
    expect(screen.getByText('101')).toBeTruthy();
    expect(screen.getByText('102')).toBeTruthy();
    expect(screen.queryByLabelText(/打开 Rating 计算器/)).toBeNull();
    expect(screen.queryByText(/^Rating/)).toBeNull();
    expect(screen.queryByText(/谱师/)).toBeNull();
    expect(screen.getByLabelText('谱面标签 标签1，点击查看说明')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('使用1P 谱面物量计算容错'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/tools/tolerance',
      params: expect.objectContaining({ tap: '51', hold: '10', slide: '20', touch: '10', break: '10' }),
    }));

    await fireEvent.press(screen.getByLabelText('查看谱面确认：協 U·TA·GE U·TA·GE'));
    expect(mockShowActionNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: '选择预览谱面',
      actions: expect.arrayContaining([
        expect.objectContaining({ label: '1P 谱面' }),
        expect.objectContaining({ label: '2P 谱面' }),
      ]),
    }));
    const notification = mockShowActionNotification.mock.calls.at(-1)?.[0] as {
      actions?: Array<{ label: string; onPress?: () => void }>;
    } | undefined;
    notification?.actions?.find((action) => action.label === '1P 谱面')?.onPress?.();
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/songs/chart-preview',
      params: expect.objectContaining({
        songId: '100123',
        chartType: 'UTAGE',
        buddySide: '0',
      }),
    }));
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

  it('shows the version of the currently selected SD or DX chart', async () => {
    mockSongRouteParams = { songId: '7', chartType: 'SD', levelIndex: '3' };
    const screen = await render(<SongDetailScreen />);

    expect(screen.getByTestId('metadata-value-版本').props.children).toBe('脱敏过往版本');
    await fireEvent.press(screen.getByLabelText('切换为DX谱面'));
    expect(screen.getByTestId('metadata-value-版本').props.children).toBe('舞萌DX 2026');
  });
});

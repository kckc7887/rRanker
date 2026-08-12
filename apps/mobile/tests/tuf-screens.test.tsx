import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Dimensions, StyleSheet } from 'react-native';
import type { TufLevel, TufPass, TufPlayer, TufVideoDetails } from '@/domain/tuf';
import { TufBestScreen, TufLevelDetailScreen, TufRecordsScreen, TufSearchScreen } from '@/screens/TufScreens';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockReplace = jest.fn();
const mockFetchNextPage = jest.fn();
const mockRefetch = jest.fn();
const mockUseTufPasses = jest.fn();
const mockUseTufLevelSearch = jest.fn();
const mockUseTufDifficulties = jest.fn();
let mockLevelDetail: TufLevel | undefined;
let mockProfile: TufPlayer | undefined;
let mockVideoDetails: TufVideoDetails | undefined;
let mockDark = false;

jest.mock('expo-router', () => ({
  router: {
    push: (value: unknown) => mockPush(value),
    replace: (value: unknown) => mockReplace(value),
  },
  useNavigation: () => ({ canGoBack: () => mockCanGoBack(), goBack: () => mockBack() }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { Image: (props: React.ComponentProps<typeof RN.View>) => React.createElement(RN.View, props) };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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
  };
});
jest.mock('@/hooks/use-user-library', () => ({
  useUserLibrary: () => ({
    data: [],
    isLoading: false,
    isError: false,
    isUpdating: false,
    songKey: (songId: string | number) => `song:adofai:${songId}`,
    setSongFavorite: jest.fn(async () => []),
    setChartPractice: jest.fn(async () => []),
    setTags: jest.fn(async () => []),
    setTagPresets: jest.fn(async () => []),
    tagPresets: [],
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/hooks/use-debounced-value', () => ({ useDebouncedValue: (value: unknown) => value }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  dark: mockDark,
  background: '#F7F8FA', surface: '#FFF', surfaceMuted: '#EEF2F7', border: '#DDD', text: '#111',
  textSecondary: '#4B5563', textMuted: '#666', accent: '#246BFD', accentSoft: '#E8F0FF',
}) }));
jest.mock('@/state/session-store', () => ({ useSession: (selector: (state: unknown) => unknown) => selector({
  activeAccountId: 'adofai:tuf:25', activeGameId: 'adofai',
}) }));
jest.mock('@/hooks/use-tuf', () => ({
  useTufProfile: () => ({ data: mockProfile, isLoading: false, isFetching: false, isError: false, error: null, refetch: mockRefetch }),
  useTufPasses: (...args: unknown[]) => mockUseTufPasses(...args),
  useTufLevelSearch: (...args: unknown[]) => mockUseTufLevelSearch(...args),
  useTufDifficulties: () => mockUseTufDifficulties(),
  useTufLevel: () => ({ data: mockLevelDetail ? { level: mockLevelDetail, rerateHistory: [] } : undefined, isLoading: false, isError: false, error: null, refetch: mockRefetch }),
  useTufVideoDetails: () => ({ data: mockVideoDetails, isLoading: !mockVideoDetails, isError: false, error: null, refetch: mockRefetch }),
}));

const level = {
  id: 11372, songId: 401, song: '关卡 A', artist: '艺术家', diffId: 8, baseScore: 12.34,
  bpm: null, tilecount: null, autoTileCount: null, levelLengthInMs: null,
  difficulty: { id: 8, name: 'G12', type: 'SPECIAL', sortOrder: 12, baseScore: 12.34 },
  levelCredits: [], tags: [], curations: [],
} as TufLevel;

function pass(id: number, title: string): TufPass {
  return {
    id, levelId: level.id + id, scoreV2: 100 + id, accuracy: 99.5, speed: 1,
    impact: 20 + id, judgements: null, level: { ...level, id: level.id + id, song: title },
  } as TufPass;
}

function infinite<T>(items: T[], field: 'passes' | 'results') {
  return {
    data: { pages: [{ [field]: items, total: items.length, offset: 0, limit: 30, hasMore: false }] },
    isLoading: false, isError: false, error: null, refetch: mockRefetch,
    hasNextPage: true, isFetchingNextPage: false, fetchNextPage: mockFetchNextPage,
  };
}

describe('TUF screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Dimensions.set({ window: { width: 390, height: 844, scale: 1, fontScale: 1 } });
    mockProfile = {
      id: 25, name: '公开玩家', rankedScore: 1824.52, generalScore: 1900, ppScore: 300,
      averageXacc: 99.8, totalPasses: 20, universalPassCount: 10, worldFirstCount: 2,
      globalRank: 12, topDiff: 'G12', topScores: [{ id: 2, impact: 22 }, { id: 1, impact: 21 }],
    } as TufPlayer;
    mockUseTufPasses.mockReturnValue(infinite([pass(1, '第一条'), pass(2, '第二条')], 'passes'));
    mockUseTufLevelSearch.mockReturnValue(infinite([level], 'results'));
    mockUseTufDifficulties.mockReturnValue({
      data: [
        { id: 1, name: 'P1', type: 'PGU' },
        { id: 2, name: 'Unranked', type: 'SPECIAL' },
        { id: 3, name: 'Marathon', type: 'LEGACY' },
      ],
      isLoading: false, isError: false, error: null, refetch: mockRefetch,
    });
    mockLevelDetail = level;
    mockVideoDetails = undefined;
    mockDark = false;
  });

  it('keeps the profile Top 20 order instead of pass response order', async () => {
    const screen = await render(<TufBestScreen />);
    const labels = screen.getAllByLabelText(/^查看关卡/).map((node) => node.props.accessibilityLabel);
    expect(labels[0]).toContain('第二条');
    expect(labels[1]).toContain('第一条');
  });

  it('changes server-side record sorting and requests the next page once', async () => {
    const screen = await render(<TufRecordsScreen />);
    await fireEvent.press(screen.getByLabelText('展开筛选器'));
    await fireEvent.press(screen.getByLabelText('选择成绩排序'));
    await fireEvent.press(screen.getByLabelText('选择排序 XACC'));
    expect(mockUseTufPasses).toHaveBeenLastCalledWith(25, expect.objectContaining({ sortBy: 'xacc' }));
    fireEvent(screen.getByTestId('tuf-records-results-list'), 'endReached');
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('deduplicates records repeated across upstream pages', async () => {
    const first = pass(1, '重复成绩');
    mockUseTufPasses.mockReturnValue({
      ...infinite([first], 'passes'),
      data: { pages: [
        { passes: [first], total: 2, offset: 0, limit: 30 },
        { passes: [first, pass(2, '唯一成绩')], total: 2, offset: 30, limit: 30 },
      ] },
    });
    const screen = await render(<TufRecordsScreen />);
    expect(screen.getAllByTestId('tuf-pass-1')).toHaveLength(1);
    expect(screen.getAllByTestId('tuf-pass-2')).toHaveLength(1);
  });

  it('filters records by keyword and supports best-per-level plus order settings', async () => {
    const screen = await render(<TufRecordsScreen />);
    await fireEvent.changeText(screen.getByLabelText('筛选 TUF 成绩'), '技术');
    expect(mockUseTufPasses).toHaveBeenLastCalledWith(25, expect.objectContaining({ query: '技术' }));
    await fireEvent.press(screen.getByLabelText('展开筛选器'));
    await fireEvent.press(screen.getByLabelText('每关最佳'));
    expect(mockUseTufPasses).toHaveBeenLastCalledWith(25, expect.objectContaining({ bestPerLevel: true }));
    await fireEvent.press(screen.getByText('升序 ↑'));
    expect(mockUseTufPasses).toHaveBeenLastCalledWith(25, expect.objectContaining({ order: 'ASC' }));
  });

  it('resets level search by query key and paginates without prefetching', async () => {
    const screen = await render(<TufSearchScreen />);
    expect(mockFetchNextPage).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('搜索 TUF 关卡'), '技术');
    expect(mockUseTufLevelSearch).toHaveBeenLastCalledWith('技术', expect.objectContaining({ sort: 'RECENT', order: 'DESC' }));
    fireEvent(screen.getByTestId('tuf-catalog-results-list'), 'endReached');
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('applies catalog sorting and PGU difficulty filters through server query options', async () => {
    const screen = await render(<TufSearchScreen />);
    await fireEvent.press(screen.getByLabelText('展开筛选器'));
    await fireEvent.press(screen.getByLabelText('选择关卡排序'));
    await fireEvent.press(screen.getByLabelText('选择排序 难度'));
    expect(mockUseTufLevelSearch).toHaveBeenLastCalledWith('', expect.objectContaining({ sort: 'DIFF' }));
    await fireEvent.press(screen.getByLabelText('筛选难度 G'));
    expect(mockUseTufLevelSearch).toHaveBeenLastCalledWith('', expect.objectContaining({
      sort: 'DIFF', pguRange: 'G1,G20', specialDifficulties: ['Unranked', 'Marathon'],
    }));
    await fireEvent.press(screen.getByLabelText('包含特殊难度'));
    expect(mockUseTufLevelSearch).toHaveBeenLastCalledWith('', expect.objectContaining({
      pguRange: 'G1,G20', specialDifficulties: undefined,
    }));
  });

  it('handles sparse detail fields and exposes HTTPS links only', async () => {
    mockLevelDetail = { ...level, dlLink: 'http://unsafe.example/file', videoLink: 'https://video.example/watch' };
    const screen = await render(<TufLevelDetailScreen levelId="11372" />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('TUF 关卡页')).toBeTruthy();
    expect(screen.getByText('视频')).toBeTruthy();
    expect(screen.queryByText('谱面下载')).toBeNull();
  });

  it('renders a real TUF media hero and falls back from proxy to the original image', async () => {
    const videoLink = 'https://www.youtube.com/watch?v=PUvyMb-qPVs';
    const image = 'https://i.ytimg.com/vi/PUvyMb-qPVs/maxresdefault.jpg';
    mockLevelDetail = { ...level, videoLink };
    mockVideoDetails = {
      title: '#4426', channelName: 'Kaleido', timestamp: null, image,
      embed: 'https://www.youtube.com/embed/PUvyMb-qPVs', downloadLink: null,
    };
    const screen = await render(<TufLevelDetailScreen levelId="11372" />);
    const heroImage = screen.getByLabelText('关卡头图 关卡 A');
    expect(heroImage.props.source).toBe(`https://api.tuforums.com/v2/media/image-proxy?url=${encodeURIComponent(image)}`);
    await fireEvent(heroImage, 'error');
    expect(screen.getByLabelText('关卡头图 关卡 A').props.source).toBe(image);
  });

  it('uses the difficulty icon while media is loading and the local icon after remote failures', async () => {
    const icon = 'https://api.tuforums.com/icons/G12.png';
    mockUseTufLevelSearch.mockReturnValue(infinite([{ ...level, difficulty: { ...level.difficulty!, icon } }], 'results'));
    const screen = await render(<TufSearchScreen />);
    const cover = screen.getByLabelText('关卡封面 关卡 A');
    expect(cover.props.source).toBe(icon);
    await fireEvent(cover, 'error');
    expect(screen.getByLabelText('关卡封面 关卡 A').props.source).not.toEqual(icon);
  });

  it('falls back from proxy to original image, difficulty icon, then the local ADOFAI icon', async () => {
    const image = 'https://i.ytimg.com/vi/PUvyMb-qPVs/maxresdefault.jpg';
    const icon = 'https://api.tuforums.com/icons/G12.png';
    mockVideoDetails = {
      title: '#4426', channelName: 'Kaleido', timestamp: null, image,
      embed: 'https://www.youtube.com/embed/PUvyMb-qPVs', downloadLink: null,
    };
    mockUseTufLevelSearch.mockReturnValue(infinite([{ ...level, videoLink: 'https://www.youtube.com/watch?v=PUvyMb-qPVs', difficulty: { ...level.difficulty!, icon } }], 'results'));
    const screen = await render(<TufSearchScreen />);
    const readSource = () => screen.getByLabelText('关卡封面 关卡 A').props.source;
    expect(readSource()).toBe(`https://api.tuforums.com/v2/media/image-proxy?url=${encodeURIComponent(image)}`);
    await fireEvent(screen.getByLabelText('关卡封面 关卡 A'), 'error');
    expect(readSource()).toBe(image);
    await fireEvent(screen.getByLabelText('关卡封面 关卡 A'), 'error');
    expect(readSource()).toBe(icon);
    await fireEvent(screen.getByLabelText('关卡封面 关卡 A'), 'error');
    expect(readSource()).not.toEqual(icon);
  });

  it('keeps a long title inside the 16:9 hero in dark mode without requiring media', async () => {
    mockDark = true;
    mockLevelDetail = { ...level, song: '这是一个用于验证详情页长标题布局不会破坏媒体头图比例的超长关卡名称' };
    const screen = await render(<TufLevelDetailScreen levelId="11372" />);
    const heroStyle = StyleSheet.flatten(screen.getByTestId('tuf-level-hero').props.style);
    expect(heroStyle).toMatchObject({ width: 390, height: 219 });
    expect(screen.getByText(mockLevelDetail.song).props.numberOfLines).toBe(3);
  });

  it('shows a back button that navigates back when possible', async () => {
    mockLevelDetail = level;
    const screen = await render(<TufLevelDetailScreen levelId="11372" />);
    await fireEvent.press(screen.getByLabelText('返回'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    mockCanGoBack.mockReturnValueOnce(false);
    const screen2 = await render(<TufLevelDetailScreen levelId="11372" />);
    await fireEvent.press(screen2.getByLabelText('返回'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/search');
  });
});

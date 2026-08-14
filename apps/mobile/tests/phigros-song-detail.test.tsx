import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { InteractionManager } from 'react-native';
import SongDetailScreen from '../app/songs/[songId]';
import { PhigrosScoreCard } from '@/components/phigros/PhigrosScoreCard';
import { PhigrosSongRow } from '@/components/phigros/PhigrosSongRow';
import type { Song } from '@/domain/models';
import { resolveChartPreviewNavigation } from '@/features/phigros-chart-preview/chart-preview-navigation';

jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
  (callback as () => void)();
  return { cancel: jest.fn() } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
});

const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockSongRouteParams: { songId: string; levelIndex?: string } = { songId: 'Song.A' };

function buildSampleSong(): Song {
  return {
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
  };
}

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
    getState: () => ({ index: 0, routes: [{ name: 'songs/[songId]' }] }),
  }),
  useLocalSearchParams: () => mockSongRouteParams,
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: { activeGameId: string }) => unknown) => selector({ activeGameId: 'phigros' }),
}));
jest.mock('@/components/AppNotification', () => ({
  NotificationOutlet: () => null,
  useNotification: () => ({ showActionNotification: jest.fn(), showNotification: jest.fn() }),
  useNotificationModalRequestClose: () => () => false,
}));
let mockCatalogSongVersion = '3.8.0';
let mockAliases = ['测试别名一', '测试别名二'];
jest.mock('@/hooks/use-phigros-catalog', () => ({
  usePhigrosCatalog: () => ({
    data: {
      snapshot: {
        songs: [{
          id: 'Song.A',
          title: '测试曲',
          artist: '测试曲师',
          illustrator: '测试曲绘师',
          version: mockCatalogSongVersion,
          aliases: mockAliases,
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
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({
    data: {
      gameId: 'phigros',
      providerId: 'phi-taptap',
      payload: {
        kind: 'phigros',
        records: [{
          songId: 'Song.A', title: 'Song.A', type: 'SD', levelIndex: 2, level: 'IN',
          difficulty: 'expert', difficultyConstant: 14.8, achievements: 99.5, dxScore: 980_000,
          rating: 14.2, fc: null, fs: null, rate: 'v', version: 'current',
        }],
        source: { kind: 'generated', label: 'TapTap云存档', updatedAt: '2026-07-20T01:00:00.000Z', isStale: false },
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-detailed-catalog', () => ({
  useDetailedCatalog: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: jest.fn() }),
}));
jest.mock('@/hooks/use-score-snapshot', () => ({
  useScoreSnapshot: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: jest.fn() }),
}));
const mockSetSongFavorite = jest.fn();
const mockSetChartPractice = jest.fn();
const mockSetTags = jest.fn();
const mockSetTagPresets = jest.fn();

jest.mock('@/hooks/use-user-library', () => {
  const { chartLibraryKey, songLibraryKey } = jest.requireActual<typeof import('../src/domain/user-library')>('../src/domain/user-library');
  const state: {
    data: {
      key: string;
      gameId: 'phigros';
      kind: 'song' | 'chart';
      songId: string;
      favorite?: boolean;
      practice?: boolean;
      type?: 'SD';
      levelIndex?: number;
      tags: string[];
    }[];
  } = { data: [] };
  return {
    __libraryMockState: state,
    useUserLibrary: () => ({
      data: state.data,
      isLoading: false,
      isUpdating: false,
      setSongFavorite: (...args: unknown[]) => mockSetSongFavorite(...args),
      setChartPractice: (...args: unknown[]) => mockSetChartPractice(...args),
      setTags: (...args: unknown[]) => mockSetTags(...args),
      setTagPresets: (...args: unknown[]) => mockSetTagPresets(...args),
      tagPresets: ['爆发', '交互'],
      songKey: (songId: string | number) => songLibraryKey('phigros', songId),
      chartKey: (songId: string | number, type: 'SD' | 'DX', levelIndex: number) => chartLibraryKey('phigros', songId, type, levelIndex),
    }),
  };
});

const libraryMock = jest.requireMock<{ __libraryMockState: { data: unknown[] } }>('@/hooks/use-user-library');
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

describe('Phigros song detail', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockSongRouteParams = { songId: 'Song.A' };
    mockCatalogSongVersion = '3.8.0';
    mockAliases = ['测试别名一', '测试别名二'];
    libraryMock.__libraryMockState.data = [];
    mockCanGoBack.mockReturnValue(true);
    jest.clearAllMocks();
  });

  it('renders title, illustrator and AT→EZ chart cards defaulting to IN', async () => {
    const screen = await render(<SongDetailScreen />);
    await waitFor(() => expect(screen.getByText('测试曲')).toBeTruthy());
    expect(screen.getByTestId('phigros-song-title-scroll').props.horizontal).toBe(true);
    expect(screen.getByText('测试曲').props.numberOfLines).toBe(1);
    expect(screen.getAllByText('测试曲绘师').length).toBeGreaterThan(0);
    expect(screen.getByTestId('phigros-metadata-value-曲绘画师').props.numberOfLines).toBe(2);
    await fireEvent(screen.getByTestId('phigros-metadata-measure-曲绘画师'), 'textLayout', {
      nativeEvent: { lines: [{}, {}, {}] },
    });
    await fireEvent(screen.getByTestId('phigros-metadata-measure-章节'), 'textLayout', {
      nativeEvent: { lines: [{}, {}, {}] },
    });
    await fireEvent.press(screen.getByLabelText('展开曲绘画师'));
    expect(screen.getByTestId('phigros-metadata-value-曲绘画师').props.numberOfLines).toBeUndefined();
    expect(screen.getByTestId('phigros-metadata-value-章节').props.numberOfLines).toBeUndefined();
    await fireEvent.press(screen.getByLabelText('收起曲绘画师'));
    expect(screen.getByTestId('phigros-metadata-value-曲绘画师').props.numberOfLines).toBe(2);
    expect(screen.getByTestId('phigros-metadata-value-章节').props.numberOfLines).toBe(2);
    expect(screen.getByLabelText('AT 难度卡片')).toBeTruthy();
    expect(screen.getByLabelText('IN 难度卡片')).toBeTruthy();
    expect(screen.getByLabelText('HD 难度卡片')).toBeTruthy();
    expect(screen.getByLabelText('EZ 难度卡片')).toBeTruthy();

    const cards = ['3', '2', '1', '0'].map((level) => screen.getByTestId(`phigros-chart-card-${level}`));
    expect(cards[0].props.accessibilityLabel).toBe('AT 难度卡片');
    expect(cards[1].props.accessibilityLabel).toBe('IN 难度卡片');
    expect(cards[2].props.accessibilityLabel).toBe('HD 难度卡片');
    expect(cards[3].props.accessibilityLabel).toBe('EZ 难度卡片');

    const carousel = screen.getByTestId('phigros-chart-carousel');
    expect(carousel.props.contentOffset.x).toBeGreaterThan(0);
  });

  it('shows expandable aliases and Kyou chart tags with vote counts', async () => {
    const screen = await render(<SongDetailScreen />);
    await waitFor(() => expect(screen.getByText('歌曲信息')).toBeTruthy());
    const aliases = screen.getByTestId('phigros-alias-text');
    expect(aliases.props.children).toBe('别名：测试别名一、测试别名二');
    expect(aliases.props.numberOfLines).toBe(1);
    expect(screen.queryByLabelText('展开别名')).toBeNull();
    await fireEvent(screen.getByTestId('phigros-alias-overflow-measure'), 'textLayout', {
      nativeEvent: { lines: [{}, {}] },
    });
    await fireEvent.press(screen.getByLabelText('展开别名'));
    expect(screen.getByTestId('phigros-alias-text').props.numberOfLines).toBeUndefined();
    await fireEvent.press(screen.getByLabelText('收起别名'));
    expect(screen.getByTestId('phigros-alias-text').props.numberOfLines).toBe(1);
    expect(screen.getByLabelText('谱面标签 综合，50 票，点击查看说明')).toBeTruthy();
    expect(screen.getByLabelText('谱面标签 差速，10 票，点击查看说明')).toBeTruthy();
    expect(screen.getAllByText('主').length).toBeGreaterThan(0);
    expect(screen.getAllByText('细').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('phigros-kyou-chart-tags-sheet')).toBeNull();
    await fireEvent.press(screen.getByTestId('phigros-kyou-chart-tags-more'));
    expect(screen.getByTestId('phigros-kyou-chart-tags-sheet').props.visible).toBe(true);
    expect(screen.getByText('主要难点')).toBeTruthy();
    expect(screen.getByText('细分配置')).toBeTruthy();
    expect(screen.queryByText('被截断项')).toBeNull();
    await fireEvent.press(screen.getByLabelText('关闭谱面标签'));
    expect(screen.queryByTestId('phigros-kyou-chart-tags-sheet')).toBeNull();
  });

  it('shows 无 when the song has no aliases', async () => {
    mockAliases = [];
    const screen = await render(<SongDetailScreen />);
    await waitFor(() => expect(screen.getByText('歌曲信息')).toBeTruthy());
    expect(screen.getByTestId('phigros-alias-text').props.children).toBe('别名：无');
    expect(screen.queryByLabelText('展开别名')).toBeNull();
  });

  it('shows floored level and Score label on chart cards', async () => {
    const screen = await render(<SongDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText('IN 难度卡片')).toBeTruthy());
    expect(screen.getAllByText('Score').length).toBeGreaterThan(0);
    // IN constant 14.8 → floor 14
    expect(screen.getByText('14')).toBeTruthy();
    // AT constant 15.9 → floor 15
    expect(screen.getByText('15')).toBeTruthy();
  });

  it('shows the chapter metadata row and hides it when the chapter is missing', async () => {
    const withChapter = await render(<SongDetailScreen />);
    await waitFor(() => expect(withChapter.getByTestId('phigros-metadata-value-章节')).toBeTruthy());
    expect(withChapter.getByText('章节')).toBeTruthy();

    mockCatalogSongVersion = '';
    const withoutChapter = await render(<SongDetailScreen />);
    await waitFor(() => expect(withoutChapter.getByLabelText('IN 难度卡片')).toBeTruthy());
    expect(withoutChapter.queryByTestId('phigros-metadata-value-章节')).toBeNull();
    expect(withoutChapter.queryByText('章节')).toBeNull();
  });

  it('shows note counts table on charts with notes and fallback when missing', async () => {
    const screen = await render(<SongDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText('IN 难度卡片')).toBeTruthy());

    const tables = screen.getAllByLabelText('谱面物量');
    expect(tables.length).toBe(3);
    expect(screen.getAllByText('TAP').length).toBe(3);
    expect(screen.getAllByText('HOLD').length).toBe(3);
    expect(screen.getAllByText('DRAG').length).toBe(3);
    expect(screen.getAllByText('FLICK').length).toBe(3);
    expect(screen.getAllByText('总计').length).toBe(3);

    const inCard = screen.getByLabelText('IN 难度卡片');
    const inTable = within(inCard).getByLabelText('谱面物量');
    expect(within(inTable).getByText('100')).toBeTruthy();
    expect(within(inTable).getByText('110')).toBeTruthy();
    expect(within(inTable).getByText('120')).toBeTruthy();
    expect(within(inTable).getByText('130')).toBeTruthy();
    expect(within(inTable).getByText('460')).toBeTruthy();

    const atCard = screen.getByLabelText('AT 难度卡片');
    expect(within(atCard).getByText('物量未提供')).toBeTruthy();
    expect(screen.queryByText('点击物量表，前往达成率与容错计算')).toBeNull();
  });

  it('shows em dash for charts without scores', async () => {
    const screen = await render(<SongDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText('AT 难度卡片')).toBeTruthy());
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('未游玩')).toBeNull();
    expect(screen.getAllByLabelText('未游玩').length).toBeGreaterThan(0);
  });

  it('opens requested levelIndex from route params', async () => {
    mockSongRouteParams = { songId: 'Song.A', levelIndex: '3' };
    const screen = await render(<SongDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('phigros-chart-carousel')).toBeTruthy());
    const carousel = screen.getByTestId('phigros-chart-carousel');
    expect(carousel.props.contentOffset.x).toBe(0);
  });

  it('goes back from chrome button', async () => {
    const screen = await render(<SongDetailScreen />);
    await fireEvent.press(screen.getByLabelText('返回'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('navigates from song row and score card', async () => {
    const sampleSong = buildSampleSong();
    const row = await render(
      <PhigrosSongRow
        song={sampleSong}
        blurUrl={null}
        favorite={false}
        onFavoriteChange={mockSetSongFavorite}
      />,
    );
    fireEvent.press(row.getByLabelText('查看歌曲 测试曲'));
    expect(mockPush).toHaveBeenCalledWith('/songs/Song.A');

    fireEvent.press(row.getByLabelText('收藏 测试曲'));
    expect(mockSetSongFavorite).toHaveBeenCalledWith('Song.A', true);

    mockPush.mockClear();
    const card = await render(
      <PhigrosScoreCard
        record={{
          songId: 'Song.A', title: 'Song.A', type: 'SD', levelIndex: 2, level: 'IN',
          difficulty: 'expert', difficultyConstant: 14.8, achievements: 99.5, dxScore: 980_000,
          rating: 14.2, fc: null, fs: null, rate: 'v', version: 'current',
        }}
        catalogTitle="测试曲"
      />,
    );
    fireEvent.press(card.getByLabelText('查看谱面 测试曲'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/songs/[songId]',
      params: { songId: 'Song.A', levelIndex: '2' },
    });
  });

  it('supports favorite, practice list and tags like maimai detail', async () => {
    const screen = await render(<SongDetailScreen />);
    await waitFor(() => expect(screen.getByText('测试曲')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('收藏 测试曲'));
    expect(mockSetSongFavorite).toHaveBeenCalledWith('Song.A', true);

    fireEvent.press(screen.getAllByLabelText('编辑标签').at(-1)!);
    expect(mockSetTags).toHaveBeenCalledWith({ kind: 'song', songId: 'Song.A' }, ['测试标签']);

    fireEvent.press(screen.getAllByLabelText('加入练习清单')[0]!);
    expect(mockSetChartPractice).toHaveBeenCalledWith('Song.A', 'SD', 3, true);

    await fireEvent.press(screen.getAllByLabelText(/查看谱面确认：/)[0]!);
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/songs/phigros-chart-preview',
      params: { requestId: expect.stringMatching(/^cp-/) },
    }));
    const href = mockPush.mock.calls.at(-1)?.[0] as { params: { requestId: string } };
    expect(resolveChartPreviewNavigation(href.params.requestId)).toEqual({
      game: 'phigros', songId: 'Song.A', levelIndex: 3, title: '测试曲 AT',
    });
  });
});

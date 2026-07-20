import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { InteractionManager } from 'react-native';
import SongDetailScreen from '../app/songs/[songId]';
import { PhigrosScoreCard } from '@/components/phigros/PhigrosScoreCard';
import { PhigrosSongRow } from '@/components/phigros/PhigrosSongRow';
import type { Song } from '@/domain/models';

jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
  (callback as () => void)();
  return { cancel: jest.fn() } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
});

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockStackScreen = jest.fn((_props: unknown) => null);
let mockSongRouteParams: { songId: string; levelIndex?: string } = { songId: 'Song.A' };

function buildSampleSong(): Song {
  return {
    id: 'Song.A',
    title: '测试曲',
    artist: '测试曲师',
    illustrator: '测试曲绘师',
    version: '3.8.0',
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
  Stack: { Screen: (props: unknown) => mockStackScreen(props) },
  router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() },
  useLocalSearchParams: () => mockSongRouteParams,
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: { activeGameId: string }) => unknown) => selector({ activeGameId: 'phigros' }),
}));
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
    error: null,
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
    data: Array<{
      key: string;
      gameId: 'phigros';
      kind: 'song' | 'chart';
      songId: string;
      favorite?: boolean;
      practice?: boolean;
      type?: 'SD';
      levelIndex?: number;
      tags: string[];
    }>;
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
    libraryMock.__libraryMockState.data = [];
    jest.clearAllMocks();
  });

  it('renders title, illustrator and AT→EZ chart cards defaulting to IN', async () => {
    const screen = await render(<SongDetailScreen />);
    await waitFor(() => expect(screen.getByText('测试曲')).toBeTruthy());
    expect(screen.getByText('测试曲绘师')).toBeTruthy();
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

  it('shows floored level and Score label on chart cards', async () => {
    const screen = await render(<SongDetailScreen />);
    await waitFor(() => expect(screen.getByLabelText('IN 难度卡片')).toBeTruthy());
    expect(screen.getAllByText('Score').length).toBeGreaterThan(0);
    // IN constant 14.8 → floor 14
    expect(screen.getByText('14')).toBeTruthy();
    // AT constant 15.9 → floor 15
    expect(screen.getByText('15')).toBeTruthy();
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
  });
});

import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { TufLevel, TufPass, TufPlayer } from '@/domain/tuf';
import { TufBestScreen, TufLevelDetailScreen, TufOverviewScreen, TufRecordsScreen, TufSearchScreen } from '@/screens/TufScreens';

const mockPush = jest.fn();
const mockFetchNextPage = jest.fn();
const mockRefetch = jest.fn();
const mockUseTufPasses = jest.fn();
const mockUseTufLevelSearch = jest.fn();
const mockUseTufDifficulties = jest.fn();
let mockLevelDetail: TufLevel | undefined;
let mockProfile: TufPlayer | undefined;
let mockNullGamePayload = false;

jest.mock('expo-router', () => ({ router: { push: (value: unknown) => mockPush(value) } }));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/hooks/use-debounced-value', () => ({ useDebouncedValue: (value: unknown) => value }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
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
}));
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => ({
  data: mockNullGamePayload ? {
    gameId: 'adofai', providerId: 'tuf', profile: {}, payload: null,
  } : mockProfile ? {
    gameId: 'adofai', providerId: 'tuf', profile: {},
    payload: {
      kind: 'adofai', player: mockProfile,
      playerScore: { label: 'RANKED SCORE', value: mockProfile.rankedScore, display: mockProfile.rankedScore.toFixed(2) },
      source: { kind: 'tuf', label: 'TUF 社区公开数据', updatedAt: '2026-08-10T00:00:00.000Z', isStale: false },
    },
  } : undefined,
  isLoading: false, isError: false, error: null, refetch: mockRefetch,
}) }));

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
    mockNullGamePayload = false;
  });

  it('keeps the profile Top 20 order instead of pass response order', async () => {
    const screen = await render(<TufBestScreen />);
    const labels = screen.getAllByLabelText(/^查看关卡/).map((node) => node.props.accessibilityLabel);
    expect(labels[0]).toContain('第二条');
    expect(labels[1]).toContain('第一条');
  });

  it('changes server-side record sorting and requests the next page once', async () => {
    const screen = await render(<TufRecordsScreen />);
    await fireEvent.press(screen.getByText('XACC'));
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
    await fireEvent.press(screen.getAllByText('难度')[0]);
    expect(mockUseTufLevelSearch).toHaveBeenLastCalledWith('', expect.objectContaining({ sort: 'DIFF' }));
    await fireEvent.press(screen.getByText('G'));
    expect(mockUseTufLevelSearch).toHaveBeenLastCalledWith('', expect.objectContaining({
      sort: 'DIFF', pguRange: 'G1,G20', specialDifficulties: ['Unranked', 'Marathon'],
    }));
    await fireEvent.press(screen.getByLabelText('包含特殊难度'));
    expect(mockUseTufLevelSearch).toHaveBeenLastCalledWith('', expect.objectContaining({
      pguRange: 'G1,G20', specialDifficulties: undefined,
    }));
  });

  it('renders overview metrics from public profile fields', async () => {
    const screen = await render(<TufOverviewScreen />);
    expect(screen.getByText('1824.52')).toBeTruthy();
    expect(screen.getByText(/世界排名 #12/)).toBeTruthy();
    expect(screen.getByText('99.80%')).toBeTruthy();
    expect(screen.getByText('公开资料')).toBeTruthy();
    expect(screen.getByText(/TUF 社区公开数据/)).toBeTruthy();
  });

  it('renders the unbound empty state without reading playerScore from a null payload', async () => {
    mockProfile = undefined;
    const screen = await render(<TufOverviewScreen />);
    expect(screen.getByText('请在游戏管理中绑定 TUF 玩家')).toBeTruthy();
    expect(screen.queryByText('冰与火之舞 · 玩家概览')).toBeNull();
  });

  it('rejects a stale cached bundle whose payload is null', async () => {
    mockNullGamePayload = true;
    const screen = await render(<TufOverviewScreen />);
    expect(screen.getByText('请在游戏管理中绑定 TUF 玩家')).toBeTruthy();
    expect(screen.queryByText('冰与火之舞 · 玩家概览')).toBeNull();
  });

  it('handles sparse detail fields and exposes HTTPS links only', async () => {
    mockLevelDetail = { ...level, dlLink: 'http://unsafe.example/file', videoLink: 'https://video.example/watch' };
    const screen = await render(<TufLevelDetailScreen levelId="11372" />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('TUF 关卡页')).toBeTruthy();
    expect(screen.getByText('视频')).toBeTruthy();
    expect(screen.queryByText('谱面下载')).toBeNull();
  });
});

import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { TufLevel, TufPass, TufPlayer } from '@/domain/tuf';
import { TufBestScreen, TufLevelDetailScreen, TufOverviewScreen, TufRecordsScreen, TufSearchScreen } from '@/screens/TufScreens';

const mockPush = jest.fn();
const mockFetchNextPage = jest.fn();
const mockRefetch = jest.fn();
const mockUseTufPasses = jest.fn();
const mockUseTufLevelSearch = jest.fn();
let mockLevelDetail: TufLevel | undefined;
let mockProfile: TufPlayer | undefined;
let mockNullGamePayload = false;

jest.mock('expo-router', () => ({ router: { push: (value: unknown) => mockPush(value) } }));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/hooks/use-debounced-value', () => ({ useDebouncedValue: (value: unknown) => value }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  background: '#F7F8FA', surface: '#FFF', border: '#DDD', text: '#111', textMuted: '#666', accent: '#246BFD',
}) }));
jest.mock('@/state/session-store', () => ({ useSession: (selector: (state: unknown) => unknown) => selector({
  activeAccountId: 'adofai:tuf:25', activeGameId: 'adofai',
}) }));
jest.mock('@/hooks/use-tuf', () => ({
  useTufProfile: () => ({ data: mockProfile, isLoading: false, isFetching: false, isError: false, error: null, refetch: mockRefetch }),
  useTufPasses: (...args: unknown[]) => mockUseTufPasses(...args),
  useTufLevelSearch: (...args: unknown[]) => mockUseTufLevelSearch(...args),
  useTufLevel: () => ({ data: mockLevelDetail ? { level: mockLevelDetail, rerateHistory: [] } : undefined, isLoading: false, isError: false, error: null, refetch: mockRefetch }),
}));
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => ({
  data: mockNullGamePayload ? {
    gameId: 'adofai', providerId: 'tuf', profile: {}, payload: null,
  } : mockProfile ? {
    gameId: 'adofai', providerId: 'tuf', profile: {},
    payload: { kind: 'adofai', player: mockProfile, playerScore: { label: 'RANKED SCORE', value: mockProfile.rankedScore, display: mockProfile.rankedScore.toFixed(2) }, source: {} },
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

  it('resets level search by query key and paginates without prefetching', async () => {
    const screen = await render(<TufSearchScreen />);
    expect(mockFetchNextPage).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('搜索 TUF 关卡'), '技术');
    expect(mockUseTufLevelSearch).toHaveBeenLastCalledWith('技术');
    fireEvent(screen.getByTestId('tuf-catalog-results-list'), 'endReached');
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('renders overview metrics from public profile fields', async () => {
    const screen = await render(<TufOverviewScreen />);
    expect(screen.getByText('1824.52')).toBeTruthy();
    expect(screen.getByText('#12')).toBeTruthy();
    expect(screen.getByText('99.80%')).toBeTruthy();
  });

  it('renders the unbound empty state without reading playerScore from a null payload', async () => {
    mockProfile = undefined;
    const screen = await render(<TufOverviewScreen />);
    expect(screen.getByText('请在游戏管理中绑定 TUF 玩家')).toBeTruthy();
    expect(screen.queryByText('TUF · RANKED SCORE')).toBeNull();
  });

  it('rejects a stale cached bundle whose payload is null', async () => {
    mockNullGamePayload = true;
    const screen = await render(<TufOverviewScreen />);
    expect(screen.getByText('请在游戏管理中绑定 TUF 玩家')).toBeTruthy();
    expect(screen.queryByText('TUF · RANKED SCORE')).toBeNull();
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

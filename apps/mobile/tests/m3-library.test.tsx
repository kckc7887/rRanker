import type { ReactNode } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import SearchScreen from '../app/(tabs)/search';
import SongDetailScreen from '../app/songs/[songId]';
import UserLibraryScreen from '../app/library';
import OverviewScreen from '../app/(tabs)/(overview)';
import type { UserLibraryItem } from '@/domain/user-library';

const mockPush = jest.fn();
const mockSetFavorite = jest.fn(async () => []);
const mockSetPractice = jest.fn(async () => []);
const mockSetTags = jest.fn(async () => []);
const mockRefetchScore = jest.fn<() => Promise<unknown>>(async () => undefined);
const timestamp = '2026-07-13T00:00:00.000Z';
const mockItems: UserLibraryItem[] = [
  { key: 'song:1', kind: 'song', songId: '1', favorite: true, tags: ['喜欢'], createdAt: timestamp, updatedAt: timestamp },
  { key: 'chart:1:DX:3', kind: 'chart', songId: '1', type: 'DX', levelIndex: 3, practice: true, tags: ['耐力'], createdAt: timestamp, updatedAt: timestamp },
  { key: 'song:999', kind: 'song', songId: '999', favorite: true, tags: [], createdAt: timestamp, updatedAt: timestamp },
];

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { GestureHandlerRootView: RN.View, Pressable: RN.Pressable, ScrollView: RN.ScrollView };
});
jest.mock('react-native-safe-area-context', () => ({
  ...(jest.requireActual('react-native-safe-area-context') as object),
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => ReactNode } }) => options?.headerRight?.() ?? null },
  router: { push: mockPush }, useLocalSearchParams: () => ({ songId: '1' }),
}));
jest.mock('@/components/SongCover', () => ({ SongCover: () => null }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({
  data: mockItems, isLoading: false, isError: false, error: null, refetch: jest.fn(), isUpdating: false,
  setSongFavorite: mockSetFavorite, setChartPractice: mockSetPractice, setTags: mockSetTags,
}) }));
jest.mock('@/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => ({
  data: jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized').fixtureCatalog,
  isLoading: false, isError: false, error: null, refetch: jest.fn(),
}) }));
jest.mock('@/hooks/use-score-snapshot', () => ({ useScoreSnapshot: () => {
  const fixtures = jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized');
  return { data: { player: fixtures.fixturePlayer, records: fixtures.fixtureRecords, source: fixtures.fixtureSource,
    catalogSource: fixtures.fixtureSource, best50: { player: fixtures.fixturePlayer, currentVersion: fixtures.fixtureCatalog.currentVersion,
      b35: [], b15: [], unmatchedRecordCount: 0, rating: 0, generatedAt: timestamp, source: fixtures.fixtureSource } },
    isLoading: false, isError: false, isDataStale: false, error: null, refetch: () => mockRefetchScore() };
} }));
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => {
  const fixtures = jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized');
  const { getGameProfile } = jest.requireActual<typeof import('../src/domain/game-profile')>('../src/domain/game-profile');
  const { maimaiPayloadFromSnapshot } = jest.requireActual<typeof import('../src/domain/game-data')>('../src/domain/game-data');
  const profile = getGameProfile('maimai');
  const snapshot = {
    player: fixtures.fixturePlayer,
    records: fixtures.fixtureRecords,
    source: fixtures.fixtureSource,
    catalogSource: fixtures.fixtureSource,
    best50: {
      player: fixtures.fixturePlayer,
      currentVersion: fixtures.fixtureCatalog.currentVersion,
      b35: [],
      b15: [],
      unmatchedRecordCount: 0,
      rating: 0,
      generatedAt: timestamp,
      source: fixtures.fixtureSource,
    },
  };
  return {
    data: {
      gameId: 'maimai' as const,
      providerId: 'diving-fish' as const,
      profile,
      payload: maimaiPayloadFromSnapshot(snapshot, profile),
    },
    profile,
    activeGameId: 'maimai' as const,
    activeProviderId: 'diving-fish' as const,
    isLoading: false,
    isError: false,
    isDataStale: false,
    error: null,
    refetch: () => mockRefetchScore(),
  };
} }));
jest.mock('@/state/query-client', () => ({
  queryClient: { invalidateQueries: jest.fn(), removeQueries: jest.fn() },
}));
jest.mock('@/state/game-picker-ui', () => ({
  useGamePickerUi: (selector: (state: {
    expandedGameId: 'maimai';
    setExpandedGameId: () => void;
    toggleExpandedGameId: () => void;
  }) => unknown) => selector({
    expandedGameId: 'maimai',
    setExpandedGameId: jest.fn(),
    toggleExpandedGameId: jest.fn(),
  }),
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: {
    session: null;
    activeGameId: 'maimai';
    activeProviderId: 'diving-fish';
    activeAccountId: string;
    boundAccounts: [];
    selectBoundAccount: () => void;
    setActiveProviderId: () => void;
    setActiveGameId: () => void;
  }) => unknown) => selector({
    session: null,
    activeGameId: 'maimai',
    activeProviderId: 'diving-fish',
    activeAccountId: 'maimai:local',
    boundAccounts: [],
    selectBoundAccount: jest.fn(),
    setActiveProviderId: jest.fn(),
    setActiveGameId: jest.fn(),
  }),
}));

describe('M3A personal library screens', () => {
  beforeEach(() => { jest.clearAllMocks(); mockRefetchScore.mockResolvedValue(undefined); });

  it('keeps five tabs and exposes the personal library from overview', async () => {
    const screen = await render(<OverviewScreen />);
    expect(screen.getByText('我的曲库')).toBeTruthy();
    expect(screen.getByText('收藏 2 首 · 练习 1 张')).toBeTruthy();
    expect(screen.getByText('·点击切换·')).toBeTruthy();
    expect(screen.getByLabelText(/点击切换账号/)).toBeTruthy();
    expect(screen.queryByText(/M0 功能线框/)).toBeNull();
    expect(screen.queryByText('刷新')).toBeNull();
  });

  it('uses one controlled pull-to-refresh action on overview', async () => {
    let finishRefresh!: () => void;
    mockRefetchScore.mockImplementationOnce(() => new Promise<void>((resolve) => { finishRefresh = resolve; }));
    const screen = await render(<OverviewScreen />);
    const refreshControl = () => screen.getByTestId('overview-scroll').props.refreshControl;

    await act(async () => {
      refreshControl().props.onRefresh();
      await Promise.resolve();
    });
    expect(mockRefetchScore).toHaveBeenCalledTimes(1);
    expect(refreshControl().props.refreshing).toBe(true);
    await act(async () => {
      refreshControl().props.onRefresh();
      await Promise.resolve();
    });
    expect(mockRefetchScore).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishRefresh();
      await Promise.resolve();
    });
    expect(refreshControl().props.refreshing).toBe(false);
  });

  it('lists favorites, practice charts and missing catalog entries with filters', async () => {
    const screen = await render(<UserLibraryScreen />);
    expect(screen.getAllByText('正常曲目 A').length).toBe(2);
    expect(screen.getByText('歌曲 ID 999')).toBeTruthy();
    expect(screen.getByText(/个人数据已保留/)).toBeTruthy();
    await fireEvent.press(screen.getByText('练习'));
    expect(screen.getByText(/练习谱面/)).toBeTruthy();
    expect(screen.queryByText('歌曲 ID 999')).toBeNull();
  });

  it('toggles a song favorite from search without opening the row', async () => {
    const screen = await render(<SearchScreen />);
    await fireEvent.press(screen.getByLabelText('取消收藏 正常曲目 A'));
    expect(mockSetFavorite).toHaveBeenCalledWith('1', false);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('edits song favorite, chart practice and tags from song detail', async () => {
    const screen = await render(<SongDetailScreen />);
    await fireEvent.press(screen.getByLabelText('取消收藏 正常曲目 A'));
    expect(mockSetFavorite).toHaveBeenCalledWith('1', false);
    await fireEvent.press(screen.getByText('已加入练习清单'));
    expect(mockSetPractice).toHaveBeenCalledWith('1', 'DX', 3, false);
    const inputs = screen.getAllByLabelText('新标签');
    await fireEvent.changeText(inputs[inputs.length - 1], '新标签');
    const addButtons = screen.getAllByText('添加');
    await fireEvent.press(addButtons[addButtons.length - 1]);
    expect(mockSetTags).toHaveBeenCalledWith({ kind: 'song', songId: '1' }, ['喜欢', '新标签']);
  });
});

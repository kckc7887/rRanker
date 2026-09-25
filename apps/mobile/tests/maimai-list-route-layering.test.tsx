import { Animated } from 'react-native';
import type { PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { GameId } from '@/domain/game-bind-options';
import { fixtureRecords, fixtureSource } from '@/fixtures/sanitized';
import { queryClient } from '@/state/query-client';
import { RecordsScreen } from '../app/(tabs)/records';
import { SearchScreen } from '../app/(tabs)/search';

let mockActiveGameId: GameId = 'maimai';
let mockActiveAccountId = 'maimai:diving-fish:demo';

const mockGetCatalog = jest.fn();
const mockGetAliases = jest.fn();
const mockUseDetailedCatalog = jest.fn<(enabled?: boolean) => unknown>();
const mockUseScoreSnapshot = jest.fn();
const mockUseDxRatingChartTags = jest.fn();
const mockUseRecordsFilter = jest.fn();
const mockUseCatalogFilter = jest.fn();

jest.spyOn(Animated, 'loop').mockReturnValue({
  start: jest.fn(), stop: jest.fn(), reset: jest.fn(),
} as unknown as ReturnType<typeof Animated.loop>);

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
  useSegments: () => [],
  Stack: { Screen: () => null },
}));
jest.mock('@/state/session-store', () => ({
  UNBOUND_ACCOUNT_ID: 'maimai:unbound',
  useSession: (selector: (state: {
    activeGameId: GameId;
    activeAccountId: string;
    catalogProvider: unknown;
  }) => unknown) => selector({
    activeGameId: mockActiveGameId,
    activeAccountId: mockActiveAccountId,
    catalogProvider: {
      getCatalog: (...args: unknown[]) => mockGetCatalog(...args),
      getAliases: (...args: unknown[]) => mockGetAliases(...args),
      getSong: jest.fn(),
      getDetailedCatalog: jest.fn(),
    },
  }),
}));
jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GestureHandlerRootView: RN.View,
    Pressable: (props: React.ComponentProps<typeof RN.Pressable>) => React.createElement(RN.Pressable, props),
    ScrollView: RN.ScrollView,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  ...(jest.requireActual('react-native-safe-area-context') as object),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: jest.fn() }),
}));
jest.mock('@/hooks/use-user-library', () => ({
  useUserLibrary: () => ({
    data: [], isLoading: false, isUpdating: false,
    setSongFavorite: jest.fn(), setChartPractice: jest.fn(), setTags: jest.fn(), setTagPresets: jest.fn(),
    tagPresets: [],
    songKey: (songId: string | number) => `maimai:song:${songId}`,
    chartKey: (songId: string | number, type: string, levelIndex: number) =>
      `maimai:chart:${songId}:${type}:${levelIndex}`,
  }),
}));
jest.mock('@/hooks/use-detailed-catalog', () => ({
  ...(jest.requireActual('@/hooks/use-detailed-catalog') as object),
  useDetailedCatalog: (enabled?: boolean) => mockUseDetailedCatalog(enabled),
}));
jest.mock('@/hooks/use-score-snapshot', () => ({
  useScoreSnapshot: (...args: unknown[]) => mockUseScoreSnapshot(...args),
}));
jest.mock('@/hooks/use-dxrating-chart-tags', () => ({
  useDxRatingChartTags: (...args: unknown[]) => mockUseDxRatingChartTags(...args),
}));
jest.mock('@/state/records-filter', () => ({
  ...(jest.requireActual('@/state/records-filter') as object),
  useRecordsFilter: () => mockUseRecordsFilter(),
}));
jest.mock('@/state/catalog-filter', () => ({
  ...(jest.requireActual('@/state/catalog-filter') as object),
  useCatalogFilter: () => mockUseCatalogFilter(),
}));
jest.mock('@/screens/PhiraScreens', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PhiraBestScreen: () => null,
    PhiraRecordsScreen: () => <RN.Text>phira-records</RN.Text>,
    PhiraCatalogScreen: () => <RN.Text>phira-catalog</RN.Text>,
    PhiraSongDetailScreen: () => null,
  };
});

function useDetailedCatalogActual(enabled?: boolean) {
  return jest.requireActual<typeof import('@/hooks/use-detailed-catalog')>('@/hooks/use-detailed-catalog')
    .useDetailedCatalog(enabled);
}

const actualRecordsFilter = jest.requireActual<typeof import('@/state/records-filter')>(
  '@/state/records-filter',
).useRecordsFilter;
const actualCatalogFilter = jest.requireActual<typeof import('@/state/catalog-filter')>(
  '@/state/catalog-filter',
).useCatalogFilter;

function fixtureCatalog() {
  return jest.requireActual<typeof import('@/fixtures/sanitized')>('@/fixtures/sanitized').fixtureCatalog;
}

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
  mockActiveGameId = 'maimai';
  mockActiveAccountId = 'maimai:diving-fish:demo';
  mockGetCatalog.mockImplementation(async () => structuredClone(fixtureCatalog()));
  mockGetAliases.mockImplementation(async () => ({ aliases: [], source: fixtureSource }));
  mockUseDetailedCatalog.mockImplementation((enabled?: boolean) => useDetailedCatalogActual(enabled));
  mockUseScoreSnapshot.mockImplementation(() => ({
    data: { records: fixtureRecords, source: fixtureSource, catalogSource: fixtureSource },
    isLoading: false,
    isError: false,
    isDataStale: false,
    error: null,
    refetch: jest.fn(),
  }));
  mockUseDxRatingChartTags.mockImplementation(() => ({
    data: undefined, isLoading: false, isError: false, error: null,
  }));
  mockUseRecordsFilter.mockImplementation(() => actualRecordsFilter());
  mockUseCatalogFilter.mockImplementation(() => actualCatalogFilter());
  actualRecordsFilter.getState().reset();
  actualCatalogFilter.getState().reset();
});

afterEach(async () => {
  await cleanup();
  queryClient.clear();
});

function listData(screen: Awaited<ReturnType<typeof render>>, testID: string): unknown[] {
  return screen.getByTestId(testID).props.data as unknown[];
}

describe('舞萌列表内容与共同路由的分层', () => {
  it('非舞萌游戏进入成绩页时不挂载舞萌曲库、成绩、标签与筛选链', async () => {
    mockActiveGameId = 'phira';
    const screen = await render(<RecordsScreen />, { wrapper });

    expect(screen.getByText('phira-records')).toBeTruthy();
    expect(mockUseDetailedCatalog).not.toHaveBeenCalled();
    expect(mockUseScoreSnapshot).not.toHaveBeenCalled();
    expect(mockUseDxRatingChartTags).not.toHaveBeenCalled();
    expect(mockUseRecordsFilter).not.toHaveBeenCalled();
    expect(mockGetCatalog).not.toHaveBeenCalled();
    expect(mockGetAliases).not.toHaveBeenCalled();
    expect(screen.queryByTestId('records-results-list')).toBeNull();
  });

  it('非舞萌游戏进入曲库页时不挂载舞萌曲库、标签与筛选链', async () => {
    mockActiveGameId = 'phira';
    const screen = await render(<SearchScreen />, { wrapper });

    expect(screen.getByText('phira-catalog')).toBeTruthy();
    expect(mockUseDetailedCatalog).not.toHaveBeenCalled();
    expect(mockUseDxRatingChartTags).not.toHaveBeenCalled();
    expect(mockUseCatalogFilter).not.toHaveBeenCalled();
    expect(mockGetCatalog).not.toHaveBeenCalled();
    expect(screen.queryByTestId('catalog-results-list')).toBeNull();
  });

  it('成绩页 A→B→A 切换后保留舞萌筛选与曲库缓存', async () => {
    const screen = await render(<RecordsScreen />, { wrapper });
    await waitFor(() => expect(listData(screen, 'records-results-list').length).toBe(fixtureRecords.length));

    await act(async () => {
      actualRecordsFilter.getState().setKeyword('脱敏曲目 1');
    });
    await waitFor(() => {
      const filtered = listData(screen, 'records-results-list').length;
      expect(filtered).toBeGreaterThan(0);
      expect(filtered).toBeLessThan(fixtureRecords.length);
    });
    const filteredCount = listData(screen, 'records-results-list').length;
    const catalogCalls = mockGetCatalog.mock.calls.length;

    mockActiveGameId = 'phira';
    await screen.rerender(<RecordsScreen />);
    expect(screen.getByText('phira-records')).toBeTruthy();

    mockActiveGameId = 'maimai';
    await screen.rerender(<RecordsScreen />);
    expect(actualRecordsFilter.getState().keyword).toBe('脱敏曲目 1');
    await waitFor(() => expect(listData(screen, 'records-results-list').length).toBe(filteredCount));
    expect(mockGetCatalog).toHaveBeenCalledTimes(catalogCalls);
  });

  it('曲库页 A→B→A 切换后保留舞萌筛选与曲库缓存', async () => {
    const screen = await render(<SearchScreen />, { wrapper });
    const catalogSongs = fixtureCatalog().songs.length;
    await waitFor(() => expect(listData(screen, 'catalog-results-list').length).toBe(catalogSongs));

    await act(async () => {
      actualCatalogFilter.getState().setKeyword('正常曲目 A');
    });
    await waitFor(() => {
      const filtered = listData(screen, 'catalog-results-list').length;
      expect(filtered).toBeGreaterThan(0);
      expect(filtered).toBeLessThan(catalogSongs);
    });
    const filteredCount = listData(screen, 'catalog-results-list').length;
    const catalogCalls = mockGetCatalog.mock.calls.length;

    mockActiveGameId = 'phira';
    await screen.rerender(<SearchScreen />);
    expect(screen.getByText('phira-catalog')).toBeTruthy();

    mockActiveGameId = 'maimai';
    await screen.rerender(<SearchScreen />);
    expect(actualCatalogFilter.getState().keyword).toBe('正常曲目 A');
    await waitFor(() => expect(listData(screen, 'catalog-results-list').length).toBe(filteredCount));
    expect(mockGetCatalog).toHaveBeenCalledTimes(catalogCalls);
  });
});

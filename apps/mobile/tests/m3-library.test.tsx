import type { Credential } from '@rranker/sdk/credentials';
import { cleanup, act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Linking, Platform } from 'react-native';
import { SearchScreen } from '../app/(tabs)/search';
import SongDetailScreen from '../app/detail';
import UserLibraryScreen from '../app/library';
import { OverviewScreen } from '../app/(tabs)/(overview)';
import type { BoundAccount } from '@rranker/sdk/account';

import { createUserDataBackup, type UserDataBackup, type RestoreMode, type UserLibraryItem } from '@rranker/sdk/domain/user-library';
import { useCatalogFilter } from '@rranker/game-maimai/state/catalog-filter';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockReplace = jest.fn();
const mockShowNotification = jest.fn();
const mockShowActions = jest.fn<(value: { title: string; actions: { label: string; onPress?: () => Promise<void> | void }[] }) => void>();
const mockCreateBackup = jest.fn(async (_gameId: string) => createUserDataBackup('maimai', [], '2026-10-26T00:00:00Z', ['练习']));
const mockRestoreBackup = jest.fn(async (_gameId: string, _backup: UserDataBackup, _mode: RestoreMode, _signal?: AbortSignal) => []);
const mockPickBackup = jest.fn<(gameId: string) => Promise<UserDataBackup | null>>(async () => null);
const mockShareBackup = jest.fn(async (_backup: UserDataBackup) => undefined);
const mockSetFavorite = jest.fn(async () => []);
const mockSetPractice = jest.fn(async () => []);
const mockSetTags = jest.fn(async () => []);
const mockRefetchScore = jest.fn<() => Promise<unknown>>(async () => undefined);
const mockCancelQueries = jest.fn<(input: unknown) => Promise<undefined>>(async () => undefined);
const mockUpdateBoundAccountScore = jest.fn();
const mockRefreshDivingFishAccounts = jest.fn<(input: unknown) => Promise<unknown>>();
const mockSessionState: {
  session: Credential | null;
  sessionsByAccountId: Record<string, Credential | undefined>;
  activeGameId: string;
  activeProviderId: 'diving-fish';
  activeAccountId: string;
  boundAccounts: BoundAccount[];
  selectBoundAccount: () => void;
  updateBoundAccountScore: typeof mockUpdateBoundAccountScore;
  setActiveProviderId: () => void;
  setActiveGameId: () => void;
} = {
  session: null,
  sessionsByAccountId: {},
  activeGameId: 'maimai',
  activeProviderId: 'diving-fish',
  activeAccountId: 'maimai:local',
  boundAccounts: [],
  selectBoundAccount: jest.fn(),
  updateBoundAccountScore: mockUpdateBoundAccountScore,
  setActiveProviderId: jest.fn(),
  setActiveGameId: jest.fn(),
};
const timestamp = '2026-07-13T00:00:00.000Z';
const mockSessionListeners = new Set<(state: typeof mockSessionState) => void>();
let mockItems: UserLibraryItem[] = [
  { key: JSON.stringify(['maimai', 'song', '1']), gameId: 'maimai', kind: 'song', id: '1', target: { songId: '1' }, favorite: true, tags: ['喜欢'], createdAt: timestamp, updatedAt: timestamp },
  { key: JSON.stringify(['maimai', 'chart', JSON.stringify(['1', 'DX', 3])]), gameId: 'maimai', kind: 'chart', id: JSON.stringify(['1', 'DX', 3]), target: { songId: '1', levelIndex: '3', chartType: 'DX' }, practice: true, tags: ['耐力'], createdAt: timestamp, updatedAt: timestamp },
  { key: JSON.stringify(['maimai', 'song', '999']), gameId: 'maimai', kind: 'song', id: '999', target: { songId: '999' }, favorite: true, tags: [], createdAt: timestamp, updatedAt: timestamp },
];

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@rranker/sdk/components/AppNotification', () => ({
  NotificationOutlet: () => null,
  useNotification: () => ({ showNotification: mockShowNotification, showActionNotification: mockShowActions }),
  useNotificationModalRequestClose: () => () => false,
}));
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
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) => options?.headerRight?.() ?? null },
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
  useNavigation: () => ({
    canGoBack: () => mockCanGoBack(),
    goBack: () => mockBack(),
  }),
  useLocalSearchParams: () => ({ songId: '1', gameId: 'maimai' }),
}));
jest.mock('@rranker/game-maimai/hooks/use-collections', () => ({ useCollections: () => ({
  data: { items: [], source: { kind: 'fixture', label: 'fixture', updatedAt: new Date(0).toISOString(), isStale: false } },
  isLoading: false, isError: false, error: null, refetch: jest.fn(),
}) }));
jest.mock('@rranker/game-maimai/components/CollectionImage', () => ({ CollectionImage: () => null }));
jest.mock('@rranker/game-maimai/components/SongCover', () => ({ SongCover: () => null }));
jest.mock('@rranker/sdk/hooks/use-user-library', () => {
    return { useUserLibrary: () => ({
    data: mockItems, isLoading: false, isError: false, error: null, refetch: jest.fn(), isUpdating: false,
    setSongFavorite: mockSetFavorite, setChartPractice: mockSetPractice, setTags: mockSetTags,
    key: (target: { gameId: string; kind: string; id: string }) => JSON.stringify([target.gameId, target.kind, target.id]),
    tagPresets: ['爆发', '交互'],
    setTagPresets: jest.fn(), createBackup: mockCreateBackup, restoreBackup: mockRestoreBackup,
  }) };
});
jest.mock('@rranker/game-maimai/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => ({
  data: jest.requireActual<typeof import('./fixtures/sanitized')>('./fixtures/sanitized').fixtureCatalog,
  isLoading: false, isError: false, error: null, refetch: jest.fn(),
}),
useMaimaiSongDetail: (songId: string) => {
  const catalog = jest.requireActual<typeof import('./fixtures/sanitized')>('./fixtures/sanitized').fixtureCatalog;
  return {
    data: catalog.songs.find((song) => song.id === songId),
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  };
} }));
jest.mock('@rranker/game-maimai/hooks/use-dxrating-chart-tags', () => ({ useDxRatingChartTags: () => ({
  data: undefined, isLoading: false, isError: false, error: null,
}) }));
jest.mock('@rranker/game-maimai/hooks/use-maimai-dxtag', () => ({ useMaimaiDxTagScores: () => null }));
jest.mock('@rranker/game-phigros/hooks/use-phigros-kyou', () => ({ usePhigrosKyouChartTags: () => ({ data: undefined, error: null }) }));
jest.mock('@rranker/game-maimai/hooks/use-plates', () => ({ usePlates: () => ({ data: undefined, error: null }) }));
jest.mock('@rranker/game-musedash/hooks/use-muse-dash', () => ({ useMuseDashAlbums: () => ({ data: undefined, source: undefined, error: null }) }));
jest.mock('@rranker/game-chunithm/hooks/use-chunithm-collections', () => ({ useChunithmCollections: () => ({ data: undefined, error: null }) }));
jest.mock('@rranker/game-chunithm/hooks/use-chunithm-catalog', () => ({
  useChunithmCatalog: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@rranker/game-phigros/hooks/use-phigros-catalog', () => ({
  usePhigrosCatalog: () => ({
    data: { snapshot: { songs: [] }, provider: null },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@rranker/game-phira/hooks/use-phira', () => ({
  usePhiraChartsByIds: () => ({ data: [], isLoading: false, isError: false, error: null, refetch: jest.fn() }),
}));
jest.mock('@rranker/game-maimai/hooks/use-score-snapshot', () => ({ useScoreSnapshot: () => {
  const fixtures = jest.requireActual<typeof import('./fixtures/sanitized')>('./fixtures/sanitized');
  return { data: { player: fixtures.fixturePlayer, records: fixtures.fixtureRecords, source: fixtures.fixtureSource,
    catalogSource: fixtures.fixtureSource, best50: { player: fixtures.fixturePlayer, currentVersion: fixtures.fixtureCatalog.currentVersion,
      b35: [], b15: [], unmatchedRecordCount: 0, rating: 0, generatedAt: timestamp, source: fixtures.fixtureSource } },
    isLoading: false, isError: false, isDataStale: false, error: null, refetch: () => mockRefetchScore() };
} }));
jest.mock('@rranker/sdk/hooks/use-game-data', () => ({ useGameData: () => {
  const fixtures = jest.requireActual<typeof import('./fixtures/sanitized')>('./fixtures/sanitized');
  const { getGameProfile } = jest.requireActual<typeof import('@rranker/sdk/domain/game-profile')>('@rranker/sdk/domain/game-profile');
  const { maimaiPayloadFromSnapshot } = jest.requireActual<typeof import('@rranker/game-maimai/domain/game-data')>('@rranker/game-maimai/domain/game-data');
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
jest.mock('@rranker/sdk/state/query-client', () => ({
  queryClient: {
    cancelQueries: (input: unknown) => mockCancelQueries(input),
    invalidateQueries: jest.fn(),
    removeQueries: jest.fn(),
  },
}));
jest.mock('@rranker/tool-maimai/services/refresh-diving-fish-accounts', () => ({
  refreshDivingFishAccounts: (input: unknown) => mockRefreshDivingFishAccounts(input),
}));
jest.mock('@rranker/sdk/state/game-picker-ui', () => ({
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
jest.mock('@rranker/sdk/state/session-store', () => ({
  UNBOUND_ACCOUNT_ID: 'maimai:unbound',
  useSession: Object.assign((selector: (state: typeof mockSessionState) => unknown) => selector(mockSessionState), {
    getState: () => mockSessionState,
    subscribe: (listener: (state: typeof mockSessionState) => void) => {
      mockSessionListeners.add(listener);
      return () => { mockSessionListeners.delete(listener); };
    },
  }),
}));

describe('M3A personal library screens', () => {
  afterEach(async () => { await cleanup(); jest.useRealTimers(); });
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockPickBackup.mockReset().mockResolvedValue(null);
    mockRestoreBackup.mockReset().mockResolvedValue([]);
    useCatalogFilter.getState().reset();
    mockRefetchScore.mockResolvedValue(undefined);
    Object.assign(mockSessionState, {
      activeGameId: 'maimai',
      session: null,
      sessionsByAccountId: {},
      activeAccountId: 'maimai:local',
      boundAccounts: [],
    });
  });

  async function chooseAction(label: string) {
    const options = mockShowActions.mock.calls.at(-1)?.[0];
    const action = options?.actions.find(item => item.label === label);
    expect(action).toBeDefined();
    await act(async () => { await action?.onPress?.(); });
  }

  it('exports the current game from the library header menu', async () => {
    const screen = await render(<UserLibraryScreen />);
    await fireEvent.press(screen.getByTestId('library-menu'));
    await chooseAction('导出');
    expect(mockCreateBackup).toHaveBeenCalledWith('maimai');
    expect(mockShareBackup).toHaveBeenCalledWith(expect.objectContaining({ gameId: 'maimai', tagPresets: ['练习'] }));
  });

  it.each(['merge', 'replace'] as const)('imports the current game with %s selected', async mode => {
    const backup = createUserDataBackup('maimai', [], timestamp, ['导入预设']);
    mockPickBackup.mockResolvedValueOnce(backup);
    const screen = await render(<UserLibraryScreen />);
    await fireEvent.press(screen.getByTestId('library-menu'));
    await chooseAction('导入');
    expect(mockPickBackup).toHaveBeenCalledWith('maimai');
    await chooseAction(mode === 'merge' ? '合并' : '替换');
    expect(mockRestoreBackup).toHaveBeenCalledWith('maimai', backup, mode, expect.any(AbortSignal));
    expect(mockShowNotification).toHaveBeenCalledWith({ title: '当前游戏个人曲库已导入', variant: 'success' });
  });

  it('keeps the current game unchanged when file selection is cancelled', async () => {
    const screen = await render(<UserLibraryScreen />);
    await fireEvent.press(screen.getByTestId('library-menu'));
    await chooseAction('导入');
    expect(mockRestoreBackup).not.toHaveBeenCalled();
  });

  it('cancels an uncommitted import when the active game changes', async () => {
    const backup = createUserDataBackup('maimai', [], timestamp);
    mockPickBackup.mockResolvedValueOnce(backup);
    let importedSignal: AbortSignal | undefined;
    let finish!: () => void;
    mockRestoreBackup.mockImplementationOnce((_game, _backup, _mode, signal) => {
      importedSignal = signal;
      return new Promise(resolve => { finish = () => resolve([]); });
    });
    const screen = await render(<UserLibraryScreen />);
    await fireEvent.press(screen.getByTestId('library-menu'));
    await chooseAction('导入');
    const restore = mockShowActions.mock.calls.at(-1)?.[0].actions.find(action => action.label === '合并');
    let pending: Promise<void> | void;
    await act(async () => { pending = restore?.onPress?.(); });
    expect(importedSignal?.aborted).toBe(false);
    await act(async () => {
      mockSessionState.activeGameId = 'phigros';
      mockSessionListeners.forEach(listener => listener(mockSessionState));
      expect(importedSignal?.aborted).toBe(true);
      finish();
      await pending;
    });
    expect(mockShowNotification).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
  });

  it('reports an import failure and allows another attempt from the menu', async () => {
    const backup = createUserDataBackup('maimai', [], timestamp);
    mockPickBackup.mockResolvedValue(backup);
    mockRestoreBackup.mockRejectedValueOnce(new Error('保存失败'));
    const screen = await render(<UserLibraryScreen />);
    await fireEvent.press(screen.getByTestId('library-menu'));
    await chooseAction('导入'); await chooseAction('合并');
    expect(mockShowNotification).toHaveBeenCalledWith(expect.objectContaining({ title: '个人曲库操作失败', variant: 'error' }));
    await fireEvent.press(screen.getByTestId('library-menu'));
    await chooseAction('导入'); await chooseAction('合并');
    expect(mockShowNotification).toHaveBeenLastCalledWith({ title: '当前游戏个人曲库已导入', variant: 'success' });
  });

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
    await waitFor(() => expect(mockRefetchScore).toHaveBeenCalledTimes(1));
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

  it('uses the active Import-Token session for a user-triggered water-fish sync', async () => {
    const fixtures = jest.requireActual<typeof import('./fixtures/sanitized')>('./fixtures/sanitized');
    const account: BoundAccount = {
      id: 'maimai:diving-fish:android-user', gameId: 'maimai', providerId: 'diving-fish',
      displayName: 'Android 玩家', scoreLabel: 'DX Rating', scoreDisplay: '15000', providerTitle: '水鱼查分器',
    };
    const session: Credential = { mode: 'import-token', value: 'android-token', persistable: true };
    Object.assign(mockSessionState, {
      session,
      sessionsByAccountId: {},
      activeAccountId: account.id,
      boundAccounts: [account],
    });
    const snapshot = {
      player: fixtures.fixturePlayer,
      records: fixtures.fixtureRecords,
      source: fixtures.fixtureSource,
      catalogSource: fixtures.fixtureSource,
      best50: {
        player: fixtures.fixturePlayer, currentVersion: fixtures.fixtureCatalog.currentVersion,
        b35: [], b15: [], unmatchedRecordCount: 0, rating: 15000,
        generatedAt: timestamp, source: fixtures.fixtureSource,
      },
    };
    mockRefreshDivingFishAccounts.mockResolvedValue({
      refreshed: [{ account, snapshot }],
      failed: [],
    });

    const screen = await render(<OverviewScreen />);
    await fireEvent.press(screen.getByLabelText('同步数据，当前 水鱼查分器'));

    await waitFor(() => expect(mockCancelQueries).toHaveBeenCalled());
    const cancelled = mockCancelQueries.mock.calls[0]?.[0] as { predicate: (query: { queryKey: unknown[] }) => boolean };
    expect(cancelled.predicate({ queryKey: ['game-data', 18, account.id] })).toBe(true);
    expect(cancelled.predicate({ queryKey: ['game-data', 18, 'other-account'] })).toBe(false);
    await waitFor(() => expect(mockRefreshDivingFishAccounts).toHaveBeenCalledWith({
      accounts: [account],
      sessionsByAccountId: { [account.id]: session },
      catalog: fixtures.fixtureCatalog,
      signal: expect.any(AbortSignal),
      assertAccount: expect.any(Function),
    }));
    expect(mockUpdateBoundAccountScore).toHaveBeenCalledWith(
      account.id,
      expect.any(String),
      fixtures.fixturePlayer.displayName,
    );
    expect(mockRefetchScore).toHaveBeenCalledTimes(1);
  });

  it('shows the unbound empty state on overview and search', async () => {
    Object.assign(mockSessionState, { activeAccountId: 'maimai:unbound' });
    const overview = await render(<OverviewScreen />);
    expect(overview.getByText('暂无绑定账号')).toBeTruthy();
    expect(overview.queryByTestId('overview-scroll')).toBeNull();

    const search = await render(<SearchScreen />);
    expect(search.getByText('暂无绑定账号')).toBeTruthy();
    expect(search.queryByLabelText('歌曲搜索')).toBeNull();
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

  it('opens practice chart detail with chartType and levelIndex', async () => {
    const screen = await render(<UserLibraryScreen />);
    await fireEvent.press(screen.getByText('练习'));
    await fireEvent.press(screen.getByText(/练习谱面/));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/detail',
      params: { songId: '1', chartType: 'DX', levelIndex: '3', gameId: 'maimai' },
    });
  });

  it('selects a local tag from the menu and returns to all items when that tag disappears', async () => {
    const screen = await render(<UserLibraryScreen />);
    await fireEvent.press(screen.getByLabelText('筛选本地标签'));
    await fireEvent.press(screen.getByLabelText('选择本地标签 喜欢'));
    expect(screen.queryByText('歌曲 ID 999')).toBeNull();
    expect(screen.getAllByText('正常曲目 A')).toHaveLength(1);
    const original = mockItems;
    try {
      mockItems = mockItems.map((item, index) => index === 0 ? { ...item, tags: [] } : item);
      await screen.rerender(<UserLibraryScreen />);
      expect(screen.getByText('全部标签')).toBeTruthy();
      expect(screen.getByText('歌曲 ID 999')).toBeTruthy();
    } finally { mockItems = original; }
  });

  it('toggles a song favorite from search without opening the row', async () => {
    const screen = await render(<SearchScreen />);
    await fireEvent.press(await screen.findByLabelText('取消收藏 正常曲目 A'));
    expect(mockSetFavorite).toHaveBeenCalledWith({ gameId: 'maimai', kind: 'song', id: '1', target: { songId: '1' } }, false);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('edits song favorite, chart practice and tags from song detail on Android', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    try {
      const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(undefined);
      const screen = await render(<SongDetailScreen />);
      await fireEvent.press(screen.getByLabelText('返回'));
      expect(mockBack).toHaveBeenCalledTimes(1);
      await fireEvent.press(await screen.findByLabelText('取消收藏 正常曲目 A'));
      expect(mockSetFavorite).toHaveBeenCalledWith({ gameId: 'maimai', kind: 'song', id: '1', target: { songId: '1' } }, false);
      await fireEvent.press(screen.getByText('已加入练习清单'));
      expect(mockSetPractice).toHaveBeenCalledWith({ gameId: 'maimai', kind: 'chart', id: JSON.stringify(['1', 'DX', 3]), target: { songId: '1', levelIndex: '3', chartType: 'DX' } }, false);
      await fireEvent.press(screen.getByText('搜索Ｂ站视频'));
      expect(openUrl).toHaveBeenCalledWith(
        `bilibili://search?keyword=${encodeURIComponent('正常曲目 A MASTER 谱面确认')}`,
      );
      expect(openUrl).toHaveBeenCalledTimes(1);
      openUrl.mockRejectedValueOnce(new Error('未安装哔哩哔哩')).mockResolvedValueOnce(undefined);
      await fireEvent.press(screen.getByText('搜索Ｂ站视频'));
      await waitFor(() => expect(openUrl).toHaveBeenNthCalledWith(
        3,
        `https://search.bilibili.com/all?keyword=${encodeURIComponent('正常曲目 A MASTER 谱面确认')}`,
      ));
      await fireEvent.press(screen.getByLabelText('删除标签 耐力'));
      expect(mockSetTags).toHaveBeenCalledWith(
        { gameId: 'maimai', kind: 'chart', id: JSON.stringify(['1', 'DX', 3]), target: { songId: '1', levelIndex: '3', chartType: 'DX' } },
        [],
      );
      const inputs = screen.getAllByLabelText('新标签');
      await fireEvent.changeText(inputs[0], '谱面标签');
      const addButtons = screen.getAllByLabelText('添加标签');
      await fireEvent.press(addButtons[0]);
      expect(mockSetTags).toHaveBeenCalledWith(
        { gameId: 'maimai', kind: 'chart', id: JSON.stringify(['1', 'DX', 3]), target: { songId: '1', levelIndex: '3', chartType: 'DX' } },
        ['耐力', '谱面标签'],
      );
      await fireEvent.changeText(inputs[inputs.length - 1], '新标签');
      await fireEvent.press(addButtons[addButtons.length - 1]);
      expect(mockSetTags).toHaveBeenCalledWith({ gameId: 'maimai', kind: 'song', id: '1', target: { songId: '1' } }, ['喜欢', '新标签']);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
    }
  });
});

jest.mock('@rranker/sdk/components/CachedTabScreen', () => ({
  ...jest.requireActual<typeof import('@rranker/sdk/components/CachedTabScreen')>('@rranker/sdk/components/CachedTabScreen'),
  StackScreenActivityScope: ({ children }: { children: import('react').ReactNode }) => children,
  useStackScreenReady: () => true,
}));

jest.mock('@/services/user-data-file-service', () => ({ pickUserDataBackup: (gameId: string) => mockPickBackup(gameId), shareUserDataBackup: (backup: UserDataBackup) => mockShareBackup(backup) }));

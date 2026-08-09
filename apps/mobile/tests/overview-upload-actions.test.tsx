import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { OverviewScreen } from '../app/(tabs)/(overview)/index';
import { createLocalMaimaiAccount, createMaimaiBoundAccount } from '@/domain/bound-account';
import type { ProviderId } from '@/domain/game-bind-options';

let mockProviderId: ProviderId = 'local';
let mockPinnedToolIds: string[] = [];
let mockPinnedPlateIds: number[] = [];
let mockSettledBundle: unknown = undefined;
const mockHydratePins = jest.fn(async () => undefined);
const mockRouterPush = jest.fn();
const mockShowNotification = jest.fn();
const mockRefetch = jest.fn<() => Promise<{ data: unknown }>>();
const mockLocal = createLocalMaimaiAccount('本地玩家', 0);
const mockExtraLocal = createLocalMaimaiAccount('本地二号', 0, 'maimai:local:second');
const mockWater = createMaimaiBoundAccount({
  providerId: 'diving-fish', displayName: '水鱼玩家', rating: 15000, playerId: 'water',
});
const mockExtraWater = createMaimaiBoundAccount({
  providerId: 'diving-fish', displayName: '水鱼二号', rating: 15000, playerId: 'water-2',
});
const mockLxns = createMaimaiBoundAccount({
  providerId: 'lxns', displayName: '落雪玩家', rating: 15000, playerId: 'lxns',
});

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args) } }));
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: mockShowNotification, showActionNotification: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/components/AccountSwitchSheet', () => ({ AccountSwitchSheet: () => null }));
let mockTemporarySelectedAccountIds: readonly string[] | undefined;
jest.mock('@/components/UploadDataSheet', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    UploadDataSheet: ({
      visible,
      temporarySelectedAccountIds,
      headerAccessory,
      contentOverride,
    }: {
      visible: boolean;
      temporarySelectedAccountIds?: readonly string[];
      headerAccessory?: ReactNode;
      contentOverride?: ReactNode;
    }) => {
    mockTemporarySelectedAccountIds = temporarySelectedAccountIds;
      return visible ? (
        <>
          {headerAccessory}
          {contentOverride ?? <RN.Text>好友码上传界面</RN.Text>}
        </>
      ) : null;
    },
  };
});
jest.mock('@/components/maimai/MaimaiUploadTabs', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaimaiUploadTabs: ({
      value,
      disabled,
      onChange,
    }: {
      value: 'friend_code' | 'lxns_guide';
      disabled: boolean;
      onChange: (value: 'friend_code' | 'lxns_guide') => void;
    }) => (
      <>
        <RN.Text>上传顶部选择栏</RN.Text>
        <RN.Pressable
          accessibilityLabel="测试切换好友码"
          accessibilityState={{ selected: value === 'friend_code', disabled }}
          disabled={disabled}
          onPress={() => onChange('friend_code')}
        />
        <RN.Pressable
          accessibilityLabel="测试切换同步引导"
          accessibilityState={{ selected: value === 'lxns_guide', disabled }}
          disabled={disabled}
          onPress={() => onChange('lxns_guide')}
        />
      </>
    ),
  };
});
jest.mock('@/components/maimai/MaimaiSyncGuideSheet', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaimaiSyncGuideContent: () => <RN.Text>舞萌同步引导界面</RN.Text>,
  };
});
jest.mock('@/components/chunithm/ChunithmSyncGuideSheet', () => ({
  ChunithmSyncGuideSheet: () => null,
}));
jest.mock('@/domain/maimai-maintenance', () => ({
  MAIMAI_MAINTENANCE_MESSAGE: '舞萌维护窗口说明',
  isMaimaiMaintenanceWindow: () => false,
}));
jest.mock('@/components/SourceStatus', () => ({ SourceStatus: () => null }));
jest.mock('@/components/DxRatingCard', () => ({ DxRatingCard: () => null }));
jest.mock('@/components/QueryStateView', () => ({
  QueryStateView: ({ data, renderData }: { data: unknown; renderData: (value: unknown) => unknown }) => (
    renderData(data)
  ),
}));
jest.mock('@/services/refresh-diving-fish-accounts', () => ({
  refreshDivingFishAccounts: jest.fn(),
}));
jest.mock('@/services/invalidate-account-data', () => ({
  invalidateAccountDataQueries: jest.fn(async () => undefined),
}));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/hooks/use-user-library', () => ({
  useUserLibrary: () => ({ data: [], isError: false }),
}));
jest.mock('@/hooks/use-detailed-catalog', () => ({
  useDetailedCatalog: () => ({ data: undefined, error: null, refetch: jest.fn(async () => ({ data: undefined })) }),
}));
jest.mock('@/hooks/use-chunithm-catalog', () => ({
  useChunithmCatalog: () => ({ data: undefined, isLoading: false, isError: false }),
}));
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({
    data: {
      gameId: 'maimai',
      providerId: mockProviderId,
      profile: {
        title: '舞萌 DX', ratingLabel: 'DX RATING', ratingDigits: 5,
        capabilities: {
          hasCatalog: true,
          hasRecords: true,
          hasBestList: true,
          hasTools: true,
        },
        bestSections: [{ id: 'b35', title: 'B35' }, { id: 'b15', title: 'B15' }],
      },
      payload: {
        kind: 'maimai',
        player: { displayName: mockProviderId === 'local' ? '本地玩家' : '水鱼玩家' },
        records: [],
        bestSections: [{ id: 'b35', title: 'B35', records: [] }, { id: 'b15', title: 'B15', records: [] }],
        playerScore: { label: 'DX RATING', value: 0, display: '00000' },
        currentVersionTitle: '当前版本',
        source: { kind: 'local', label: '成绩', updatedAt: '2026-07-17T00:00:00.000Z', isStale: false },
        catalogSource: { kind: 'lxns', label: '曲库', updatedAt: '2026-07-17T00:00:00.000Z', isStale: false },
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockRefetch,
    profile: { ratingLabel: 'DX RATING', ratingDigits: 5 },
  }),
}));
jest.mock('@/hooks/use-plates', () => ({
  usePlates: () => ({
    data: {
      plates: [
        { id: 6101, name: '真極', requirements: [{ difficulties: [], rate: 's', songs: ['1'] }] },
        { id: 6102, name: '真神', requirements: [{ difficulties: [], fc: 'ap', songs: ['1'] }] },
      ],
      source: { kind: 'fixture', label: '牌子', updatedAt: '2026-07-17T00:00:00.000Z', isStale: false },
    },
  }),
}));
jest.mock('@/state/session-store', () => ({
  applyLxnsTokenRotation: jest.fn(),
  useSession: (selector: (state: unknown) => unknown) => selector({
    boundAccounts: [mockLocal, mockExtraLocal, mockWater, mockExtraWater, mockLxns],
    activeGameId: 'maimai',
    activeAccountId: mockProviderId === 'local'
      ? mockExtraLocal.id
      : mockProviderId === 'lxns'
        ? mockLxns.id
        : mockExtraWater.id,
    session: mockProviderId === 'local'
      ? null
      : mockProviderId === 'lxns'
        ? {
            mode: 'lxns-oauth',
            accessToken: 'access',
            refreshToken: 'refresh',
            expiresAt: '2026-08-01T00:00:00.000Z',
          }
        : { mode: 'import-token', value: 'token', persistable: true },
    sessionsByAccountId: {
      [mockWater.id]: { mode: 'import-token', value: 'water-token', persistable: true },
      [mockExtraWater.id]: { mode: 'import-token', value: 'water-token-2', persistable: true },
      [mockLxns.id]: {
        mode: 'lxns-oauth',
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 60_000,
        persistable: true,
      },
    },
    selectBoundAccount: jest.fn(),
    updateBoundAccountScore: jest.fn(),
  }),
}));
jest.mock('@/state/toolbox-pins', () => ({
  useToolboxPins: (selector: (state: {
    pinnedToolIdsByGame: { maimai: string[]; chunithm: string[]; phigros: string[]; test: string[] };
    pinnedPlateIdsByGame: { maimai: number[]; chunithm: number[]; phigros: number[]; test: number[] };
    pinnedCollectionIdsByGame: { maimai: unknown[]; chunithm: unknown[]; phigros: unknown[]; test: unknown[] };
    hydrate: typeof mockHydratePins;
  }) => unknown) => selector({
    pinnedToolIdsByGame: { maimai: mockPinnedToolIds, chunithm: [], phigros: [], test: [] },
    pinnedPlateIdsByGame: { maimai: mockPinnedPlateIds, chunithm: [], phigros: [], test: [] },
    pinnedCollectionIdsByGame: { maimai: [], chunithm: [], phigros: [], test: [] },
    hydrate: mockHydratePins,
  }),
}));
jest.mock('@/state/game-picker-ui', () => ({
  useGamePickerUi: (selector: (state: unknown) => unknown) => selector({
    expandedGameId: 'maimai',
    setExpandedGameId: jest.fn(),
    toggleExpandedGameId: jest.fn(),
  }),
}));
jest.mock('@/state/query-client', () => ({
  queryClient: {
    cancelQueries: jest.fn(),
    invalidateQueries: jest.fn(),
    getQueryData: jest.fn(() => mockSettledBundle),
  },
}));
jest.mock('@/storage/secure-session-store', () => ({
  SecureSessionStore: jest.fn(() => ({ setActiveAccountId: jest.fn() })),
}));

describe('总览上传和同步操作', () => {
  beforeEach(() => {
    mockTemporarySelectedAccountIds = undefined;
    mockPinnedToolIds = [];
    mockPinnedPlateIds = [];
    mockSettledBundle = undefined;
    mockShowNotification.mockClear();
    mockRouterPush.mockClear();
    mockRefetch.mockResolvedValue({ data: undefined });
  });

  it('本地查分器页只显示使用好友码的同步按钮', async () => {
    mockProviderId = 'local';
    const screen = await render(<OverviewScreen />);
    expect(screen.getByLabelText('同步本地查分器数据，好友码')).toBeTruthy();
    expect(screen.getByText('好友码')).toBeTruthy();
    expect(screen.queryByText('上传数据')).toBeNull();
  });

  it('额外本地玩家同步时只临时勾选当前玩家', async () => {
    mockProviderId = 'local';
    const screen = await render(<OverviewScreen />);
    await fireEvent.press(screen.getByLabelText('同步本地查分器数据，好友码'));
    await waitFor(() => expect(mockTemporarySelectedAccountIds).toEqual([mockExtraLocal.id]));
  });

  it('其他舞萌查分器页显示上传与同步双按钮，上传页也可切换同步引导', async () => {
    mockProviderId = 'diving-fish';
    const screen = await render(<OverviewScreen />);
    expect(screen.getByText('上传数据')).toBeTruthy();
    expect(screen.getByText('好友码')).toBeTruthy();
    expect(screen.getByLabelText('同步数据，当前 水鱼查分器')).toBeTruthy();
    await fireEvent.press(screen.getByText('上传数据'));
    expect(screen.getByText('好友码上传界面')).toBeTruthy();
    expect(screen.getByText('上传顶部选择栏')).toBeTruthy();
    await waitFor(() => expect(mockTemporarySelectedAccountIds).toEqual([mockExtraWater.id]));

    await fireEvent.press(screen.getByLabelText('测试切换同步引导'));
    expect(screen.getByText('舞萌同步引导界面')).toBeTruthy();
  });

  it('落雪页面正常打开好友码界面，并在顶部切换同步引导', async () => {
    mockProviderId = 'lxns';
    const screen = await render(<OverviewScreen />);
    await fireEvent.press(screen.getByText('上传数据'));
    expect(screen.getByText('好友码上传界面')).toBeTruthy();
    expect(screen.getByText('上传顶部选择栏')).toBeTruthy();
    expect(screen.getByLabelText('测试切换好友码').props.accessibilityState.selected).toBe(true);
    await waitFor(() => expect(mockTemporarySelectedAccountIds).toEqual([mockLxns.id]));

    await fireEvent.press(screen.getByLabelText('测试切换同步引导'));
    expect(screen.getByText('舞萌同步引导界面')).toBeTruthy();
    expect(screen.queryByText('好友码上传界面')).toBeNull();
    expect(screen.getByLabelText('测试切换同步引导').props.accessibilityState.selected).toBe(true);

    await fireEvent.press(screen.getByLabelText('测试切换好友码'));
    expect(screen.getByText('好友码上传界面')).toBeTruthy();
  });

  it('在总览外显当前游戏的置顶工具', async () => {
    mockPinnedToolIds = ['rating'];
    const screen = await render(<OverviewScreen />);
    expect(screen.getByText('置顶工具')).toBeTruthy();
    expect(screen.getByLabelText('打开置顶工具 DX Rating 计算器')).toBeTruthy();
  });

  it('工具箱入口描述超过一行时单行省略', async () => {
    mockProviderId = 'local';
    const screen = await render(<OverviewScreen />);
    const summary = screen.getByText('Rating · 达成率/容错 · 牌子进度 · 版本对照 · 万花筒 · 随机歌曲 · 机厅查找 · 成绩图片');
    expect(summary.props.numberOfLines).toBe(1);
    expect(summary.props.ellipsizeMode).toBe('tail');
  });

  it('在置顶工具上方展示牌子进度，并携带牌子参数跳转', async () => {
    mockPinnedPlateIds = [6102];
    mockPinnedToolIds = ['rating'];
    const screen = await render(<OverviewScreen />);
    const homeCardLabels = screen.getAllByText(/^(牌子进度|置顶工具)$/)
      .map((node) => node.props.children);
    expect(homeCardLabels).toEqual(['牌子进度', '置顶工具']);
    await fireEvent.press(screen.getByLabelText('打开主页牌子 真神'));
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/tools/plates',
      params: { plateId: '6102' },
    });
  });

  it('同步失败时改用全局错误通知', async () => {
    mockProviderId = 'diving-fish';
    const screen = await render(<OverviewScreen />);
    await fireEvent.press(screen.getByLabelText('同步数据，当前 水鱼查分器'));
    await waitFor(() => expect(mockShowNotification).toHaveBeenCalledWith({
      title: '同步失败',
      message: '舞萌曲库尚未就绪，请稍后重试',
      variant: 'error',
    }));
  });

  it('落雪同步时 refetch 返回打标缓存但最终缓存已新鲜，不误报仅读取到缓存', async () => {
    mockProviderId = 'lxns';
    mockRefetch.mockResolvedValue({
      data: {
        gameId: 'maimai',
        providerId: 'lxns',
        profile: { ratingDigits: 5 },
        payload: {
          kind: 'maimai',
          player: { displayName: '落雪玩家' },
          records: [],
          bestSections: [],
          playerScore: { label: 'DX RATING', value: 15000, display: '15000' },
          currentVersionTitle: '当前版本',
          source: { kind: 'lxns', label: '落雪咖啡屋', updatedAt: '2026-07-17T00:00:00.000Z', isStale: true },
          catalogSource: { kind: 'lxns', label: '曲库', updatedAt: '2026-07-17T00:00:00.000Z', isStale: false },
        },
      },
    });
    mockSettledBundle = {
      gameId: 'maimai',
      providerId: 'lxns',
      payload: {
        kind: 'maimai',
        source: { kind: 'lxns', label: '落雪咖啡屋', updatedAt: '2026-07-17T00:00:00.000Z', isStale: false },
        catalogSource: { kind: 'lxns', label: '曲库', updatedAt: '2026-07-17T00:00:00.000Z', isStale: false },
      },
    };
    const screen = await render(<OverviewScreen />);

    await fireEvent.press(screen.getByLabelText('同步数据，当前 落雪咖啡屋'));
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    expect(mockShowNotification).not.toHaveBeenCalled();
  });

  it('落雪同步时后台读取也失败，提示本次仅读取到缓存', async () => {
    mockProviderId = 'lxns';
    const staleBundle = {
      gameId: 'maimai',
      providerId: 'lxns',
      payload: {
        kind: 'maimai',
        source: { kind: 'cache', label: '最近有效成绩快照', updatedAt: '2026-07-17T00:00:00.000Z', isStale: true },
        catalogSource: { kind: 'lxns', label: '曲库', updatedAt: '2026-07-17T00:00:00.000Z', isStale: false },
      },
    };
    mockRefetch.mockResolvedValue({ data: staleBundle });
    mockSettledBundle = staleBundle;
    const screen = await render(<OverviewScreen />);

    await fireEvent.press(screen.getByLabelText('同步数据，当前 落雪咖啡屋'));
    await waitFor(() => expect(mockShowNotification).toHaveBeenCalledWith({
      title: '尚未读取到新数据',
      message: '本次仅读取到缓存，请关闭代理并检查网络后重试。',
      variant: 'warning',
    }));
  });
});

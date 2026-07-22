import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { GameAccountsScreen } from '@/screens/GameAccountsScreen';
import {
  createLocalMaimaiAccount,
  createMaimaiBoundAccount,
  createMaxedMaimaiTestAccount,
  createTestBoundAccount,
  type BoundAccount,
} from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { NotificationProvider } from '@/components/AppNotification';

const mockUpsertDemoAccount = jest.fn(async (_profile?: unknown) => undefined);
const mockRemoveDemoAccount = jest.fn(async (_accountId?: string) => undefined);
const mockRemoveAccount = jest.fn(async (_accountId?: string) => undefined);
const mockSetActiveAccountId = jest.fn(async (_accountId?: string | null) => undefined);
const mockClearSnapshots = jest.fn(async () => undefined);
const mockClearUserData = jest.fn(async () => []);
const mockRemoveBoundAccount = jest.fn();
const mockSelectBoundAccount = jest.fn();
const mockUpsertBoundAccount = jest.fn();
const mockRenameLocalAccount = jest.fn();
const mockUpsertLocalAccount = jest.fn(async (_profile?: unknown) => undefined);
const mockRemoveLocalAccount = jest.fn(async (_accountId?: string) => undefined);
const mockRemoveQueries = jest.fn();
const mockClearOrder: string[] = [];
const mockSession: ProviderSession = { mode: 'jwt', value: 'token', persistable: true };
const mockAccount = createMaimaiBoundAccount({
  providerId: 'diving-fish',
  displayName: '测试水鱼',
  rating: 15000,
  playerId: 'u1',
});
const mockLocalAccount = createLocalMaimaiAccount('本地玩家', 0);
const mockTestAccount = createMaxedMaimaiTestAccount();
const mockEmptyGameAccount = createTestBoundAccount();
let mockBoundAccounts = [mockLocalAccount, mockTestAccount, mockAccount, mockEmptyGameAccount];

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { GestureHandlerRootView: RN.View, Pressable: RN.Pressable };
});
jest.mock('@/components/ProviderLoginSheet', () => ({
  ProviderLoginSheet: ({ visible, provider, gameTitle }: {
    visible: boolean;
    provider: { title: string } | null;
    gameTitle: string;
  }) => {
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    if (!visible || !provider) return null;
    return (
      <RN.View>
        <RN.Text>登录查分器</RN.Text>
        <RN.Text>{provider.title}</RN.Text>
        <RN.Text>{`用于绑定 ${gameTitle}`}</RN.Text>
      </RN.View>
    );
  },
}));
jest.mock('@/storage/secure-session-store', () => ({ SecureSessionStore: jest.fn(() => ({
  removeAccount: async (accountId: string) => {
    mockClearOrder.push('credentials');
    return mockRemoveAccount(accountId);
  },
  setActiveAccountId: async (accountId: string) => mockSetActiveAccountId(accountId),
})) }));
jest.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: jest.fn(() => ({ clear: async () => {
  mockClearOrder.push('cache');
  return mockClearSnapshots();
} })) }));
jest.mock('@/storage/local-account-store', () => ({
  LocalAccountStore: jest.fn(() => ({
    upsert: (profile: { id: string; displayName: string }) => mockUpsertLocalAccount(profile),
    remove: (accountId: string) => mockRemoveLocalAccount(accountId),
  })),
  LOCAL_PLAYER_NAME_MAX_LENGTH: 20,
  normalizeLocalPlayerName: (value: string) => value.trim() || null,
}));
jest.mock('@/storage/demo-account-store', () => ({
  DemoAccountStore: jest.fn(() => ({
    upsert: (profile: { id: string; displayName: string }) => mockUpsertDemoAccount(profile),
    remove: (accountId: string) => mockRemoveDemoAccount(accountId),
  })),
  DEFAULT_DEMO_PLAYER_NAME: '示例账号',
  isMaimaiDemoAccountId: (accountId: string) => accountId === 'maimai:test' || accountId.startsWith('maimai:test:'),
}));
jest.mock('@/state/query-client', () => ({ queryClient: {
  invalidateQueries: jest.fn(),
  setQueriesData: jest.fn(),
  removeQueries: (...args: unknown[]) => mockRemoveQueries(...args),
} }));
jest.mock('@/state/session-store', () => {
  const state = () => ({
    session: mockSession,
    sessionsByAccountId: { [mockAccount.id]: mockSession },
    boundAccounts: mockBoundAccounts,
    activeAccountId: mockAccount.id,
    selectBoundAccount: mockSelectBoundAccount,
    upsertBoundAccount: mockUpsertBoundAccount,
    renameLocalAccount: mockRenameLocalAccount,
    removeBoundAccount: mockRemoveBoundAccount,
    restoreError: null,
    activeGameId: 'maimai',
    activeProviderId: 'diving-fish',
  });
  const useSession = (selector: (value: unknown) => unknown) => selector(state());
  useSession.getState = state;
  return { UNBOUND_ACCOUNT_ID: 'maimai:unbound', useSession };
});
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
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({
  data: [], isLoading: false, clearGameUserData: async () => {
    mockClearOrder.push('personal');
    return mockClearUserData();
  },
}) }));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 34 }));

describe('M3A game account management', () => {
  beforeEach(() => { jest.clearAllMocks(); mockClearOrder.length = 0; mockBoundAccounts = [mockLocalAccount, mockTestAccount, mockAccount, mockEmptyGameAccount]; });

  const renderScreen = () => render(
    <NotificationProvider>
      <GameAccountsScreen />
    </NotificationProvider>,
  );

  it('keeps the original account cards and add button while grouping existing games', async () => {
    const screen = await renderScreen();
    expect(screen.getByLabelText('收起游戏 舞萌 DX')).toBeTruthy();
    expect(screen.getByLabelText('收起游戏 测试游戏')).toBeTruthy();
    expect(screen.getByText('水鱼查分器')).toBeTruthy();
    expect(screen.getByText('测试水鱼')).toBeTruthy();
    expect(screen.getByLabelText('添加游戏账号')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId(`account-card-${mockAccount.id}`).props.style)).toEqual(expect.objectContaining({
      backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#246BFD',
    }));
    expect(StyleSheet.flatten(screen.getByLabelText('添加游戏账号').props.style)).toEqual(expect.objectContaining({
      right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#246BFD',
    }));
    expect(screen.queryByText('Phigros')).toBeNull();

    await fireEvent.press(screen.getByLabelText('添加游戏账号'));
    expect(screen.getByText('选择游戏')).toBeTruthy();
    expect(screen.getByText('Phigros')).toBeTruthy();
    expect(screen.getByLabelText('水鱼查分器')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('水鱼查分器'));
    await waitFor(() => expect(screen.getByText('登录查分器')).toBeTruthy());
    expect(screen.getByText('用于绑定 舞萌 DX')).toBeTruthy();
  });

  it('collapses only the selected existing-game account list', async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('收起游戏 舞萌 DX'));
    expect(screen.queryByText('测试水鱼')).toBeNull();
    expect(screen.getByText('空数据')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('展开游戏 舞萌 DX'));
    expect(screen.getByText('测试水鱼')).toBeTruthy();
  });

  it('shows local and generated test accounts in account management', async () => {
    const screen = await renderScreen();
    expect(screen.getByText('本地玩家')).toBeTruthy();
    expect(screen.getByText('示例账号')).toBeTruthy();
    expect(screen.queryByText('数据位置：仅本机 SQLite')).toBeNull();
    expect(screen.queryByText('数据来源：曲库动态生成')).toBeNull();
    expect(screen.queryByText('当前使用中')).toBeNull();
    expect(screen.queryByText('可随时删除')).toBeNull();
    expect(screen.queryByText('已绑定')).toBeNull();
  });

  it('allows deleting the default local player and demo account', async () => {
    const screen = await renderScreen();
    expect(screen.getByLabelText('删除本地玩家 本地玩家')).toBeTruthy();
    expect(screen.getByLabelText('删除示例账号 示例账号')).toBeTruthy();
  });

  it('switches to existing demo account when demo provider is selected again', async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('添加游戏账号'));
    await fireEvent.press(screen.getByLabelText('示例查分器'));
    await waitFor(() => expect(mockSelectBoundAccount).toHaveBeenCalledWith(mockTestAccount.id));
    expect(mockUpsertDemoAccount).not.toHaveBeenCalled();
  });

  it('renames a local player from its account card', async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('修改名称 本地玩家'));
    await fireEvent.changeText(screen.getByLabelText('本地玩家名称'), '我的本地号');
    await fireEvent.press(screen.getByLabelText('保存本地玩家名称'));

    await waitFor(() => expect(mockUpsertLocalAccount).toHaveBeenCalledWith({
      id: mockLocalAccount.id,
      displayName: '我的本地号',
    }));
    expect(mockRenameLocalAccount).toHaveBeenCalledWith(mockLocalAccount.id, '我的本地号');
  });

  it('adds another local player instead of reusing the default account', async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('添加游戏账号'));
    await fireEvent.press(screen.getByLabelText('本地查分器'));

    await waitFor(() => expect(mockUpsertBoundAccount).toHaveBeenCalledTimes(1));
    const added = mockUpsertBoundAccount.mock.calls[0][0] as BoundAccount;
    expect(added).toMatchObject({ providerId: 'local', displayName: '本地玩家 2' });
    expect(added.id).toMatch(/^maimai:local:/);
    expect(added.id).not.toBe(mockLocalAccount.id);
    expect(mockUpsertLocalAccount).toHaveBeenCalledWith({
      id: added.id,
      displayName: '本地玩家 2',
    });
    await waitFor(() => expect(mockSelectBoundAccount).toHaveBeenCalledWith(added.id));
    await waitFor(() => expect(screen.getByLabelText('本地玩家名称')).toBeTruthy());
  });

  it('does not ask to clear personal data when another account of the game remains', async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByText('解除绑定'));
    expect(screen.queryByText('解绑并清除个人数据')).toBeNull();
    await fireEvent.press(screen.getByText('确认解绑'));
    await waitFor(() => expect(mockClearSnapshots).toHaveBeenCalledTimes(1));
    expect(mockClearUserData).not.toHaveBeenCalled();
    expect(mockRemoveAccount).toHaveBeenCalledWith(mockAccount.id);
    expect(mockRemoveBoundAccount).toHaveBeenCalledWith(mockAccount.id);
    expect(mockClearOrder).toEqual(['credentials', 'cache']);
    expect(mockRemoveQueries).toHaveBeenCalledTimes(5);
    expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ['detailed-catalog'] });
    expect(mockRemoveQueries).not.toHaveBeenCalledWith({ queryKey: ['user-library'] });
  });

  it('offers game-scoped personal data cleanup for the final account', async () => {
    mockBoundAccounts = [mockAccount, mockEmptyGameAccount];
    const screen = await renderScreen();
    await fireEvent.press(screen.getByText('解除绑定'));
    expect(screen.getByText('确认解绑并保留个人数据')).toBeTruthy();
    await fireEvent.press(screen.getByText('解绑并清除个人数据'));
    await waitFor(() => expect(mockClearUserData).toHaveBeenCalledTimes(1));
    expect(mockClearOrder).toEqual(['credentials', 'cache', 'personal']);
  });

  it('continues clearing, logs out and reports the failed part when one store fails', async () => {
    mockClearSnapshots.mockRejectedValueOnce(new Error('locked'));
    mockBoundAccounts = [mockAccount, mockEmptyGameAccount];
    const screen = await renderScreen();
    await fireEvent.press(screen.getByText('解除绑定'));
    await fireEvent.press(screen.getByText('解绑并清除个人数据'));

    await waitFor(() => expect(screen.getByText('部分清除失败（缓存），其余项目已清除，请重试')).toBeTruthy());
    expect(mockClearUserData).toHaveBeenCalledTimes(1);
    expect(mockRemoveBoundAccount).toHaveBeenCalledTimes(1);
    expect(mockRemoveQueries).toHaveBeenCalledTimes(5);
    expect(mockClearOrder).toEqual(['credentials', 'cache', 'personal']);
  });
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { jest } from '@jest/globals';
import GameAccountsScreen from '../app/(tabs)/settings/games';
import {
  createLocalMaimaiAccount,
  createMaimaiBoundAccount,
  createMaxedMaimaiTestAccount,
  type BoundAccount,
} from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';

const mockRemoveAccount = jest.fn(async (_accountId?: string) => undefined);
const mockSetActiveAccountId = jest.fn(async (_accountId?: string) => undefined);
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

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));
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
jest.mock('@/state/query-client', () => ({ queryClient: {
  invalidateQueries: jest.fn(), removeQueries: (...args: unknown[]) => mockRemoveQueries(...args),
} }));
jest.mock('@/state/session-store', () => ({ useSession: (selector: (state: unknown) => unknown) => selector({
  session: mockSession,
  sessionsByAccountId: { [mockAccount.id]: mockSession },
  boundAccounts: [mockLocalAccount, mockTestAccount, mockAccount],
  activeAccountId: mockAccount.id,
  selectBoundAccount: mockSelectBoundAccount,
  upsertBoundAccount: mockUpsertBoundAccount,
  renameLocalAccount: mockRenameLocalAccount,
  removeBoundAccount: mockRemoveBoundAccount,
  restoreError: null,
  activeGameId: 'maimai',
  activeProviderId: 'diving-fish',
}) }));
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
  data: [], isLoading: false, clearUserData: async () => {
    mockClearOrder.push('personal');
    return mockClearUserData();
  },
}) }));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 34 }));

describe('M3A game account management', () => {
  beforeEach(() => { jest.clearAllMocks(); mockClearOrder.length = 0; });

  it('expands an inline provider list and opens the login sheet', async () => {
    const screen = await render(<GameAccountsScreen />);
    expect(screen.getByText('舞萌 DX · 水鱼查分器')).toBeTruthy();
    expect(screen.getByText('测试水鱼')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('添加游戏账号'));
    expect(screen.getByText('选择游戏')).toBeTruthy();
    expect(screen.getByText('Phigros')).toBeTruthy();
    expect(screen.getByText('测试游戏')).toBeTruthy();
    expect(screen.getByText('空数据预览 · 在总览切换')).toBeTruthy();
    expect(screen.getByText('查分器')).toBeTruthy();
    expect(screen.getByLabelText('水鱼查分器')).toBeTruthy();
    expect(screen.getByLabelText('落雪查分器')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('水鱼查分器'));
    await waitFor(() => expect(screen.getByText('登录查分器')).toBeTruthy());
    expect(screen.getByText('用于绑定 舞萌 DX')).toBeTruthy();
  });

  it('shows the empty test game entry in the bind picker', async () => {
    const screen = await render(<GameAccountsScreen />);
    await fireEvent.press(screen.getByLabelText('添加游戏账号'));
    expect(screen.getByText('测试游戏')).toBeTruthy();
    expect(screen.getByText('空数据预览 · 在总览切换')).toBeTruthy();
  });

  it('shows local and generated test accounts in account management', async () => {
    const screen = await render(<GameAccountsScreen />);
    expect(screen.getByText('本地玩家')).toBeTruthy();
    expect(screen.getByText('测试玩家')).toBeTruthy();
    expect(screen.getByText('数据位置：仅本机 SQLite')).toBeTruthy();
    expect(screen.getByText('数据来源：曲库动态生成')).toBeTruthy();
  });

  it('renames a local player from its account card', async () => {
    const screen = await render(<GameAccountsScreen />);
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
    const screen = await render(<GameAccountsScreen />);
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
    expect(mockSelectBoundAccount).toHaveBeenCalledWith(added.id);
  });

  it('asks on every unbind and preserves or removes personal data as selected', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = await render(<GameAccountsScreen />);
    await fireEvent.press(screen.getByText('解除绑定'));
    const preserveButtons = alert.mock.calls[0][2]!;
    await act(async () => preserveButtons[1].onPress?.());
    await waitFor(() => expect(mockClearSnapshots).toHaveBeenCalledTimes(1));
    expect(mockClearUserData).not.toHaveBeenCalled();
    expect(mockRemoveAccount).toHaveBeenCalledWith(mockAccount.id);
    expect(mockRemoveBoundAccount).toHaveBeenCalledWith(mockAccount.id);

    await fireEvent.press(screen.getByText('解除绑定'));
    const removeButtons = alert.mock.calls[1][2]!;
    await act(async () => removeButtons[2].onPress?.());
    await waitFor(() => expect(mockClearUserData).toHaveBeenCalledTimes(1));
    expect(mockRemoveAccount).toHaveBeenCalledTimes(2);
    expect(mockClearSnapshots).toHaveBeenCalledTimes(2);
    expect(mockRemoveBoundAccount).toHaveBeenCalledTimes(2);
    expect(mockClearOrder).toEqual(['credentials', 'cache', 'credentials', 'cache', 'personal']);
    expect(mockRemoveQueries).toHaveBeenCalledTimes(10);
    expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ['detailed-catalog'] });
    expect(mockRemoveQueries).not.toHaveBeenCalledWith({ queryKey: ['user-library'] });
    alert.mockRestore();
  });

  it('continues clearing, logs out and reports the failed part when one store fails', async () => {
    mockClearSnapshots.mockRejectedValueOnce(new Error('locked'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = await render(<GameAccountsScreen />);
    await fireEvent.press(screen.getByText('解除绑定'));
    await act(async () => alert.mock.calls[0][2]![2].onPress?.());

    await waitFor(() => expect(screen.getByText('部分清除失败（缓存），其余项目已清除，请重试')).toBeTruthy());
    expect(mockClearUserData).toHaveBeenCalledTimes(1);
    expect(mockRemoveBoundAccount).toHaveBeenCalledTimes(1);
    expect(mockRemoveQueries).toHaveBeenCalledTimes(5);
    expect(mockClearOrder).toEqual(['credentials', 'cache', 'personal']);
    alert.mockRestore();
  });
});

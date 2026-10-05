import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { GameAccountsScreen } from '@/screens/GameAccountsScreen';

const mockRestoreAppAccounts = jest.fn(async () => undefined);
const mockClearSessions = jest.fn(async () => ({ committed: true, cleanupFailures: [] as string[] }));
const mockShowNotification = jest.fn();
const mockShowActionNotification = jest.fn();
let mockRestoreError: string | null = '无法读取本机登录状态，请重试恢复。';
let mockSourceStatuses: { source: string; status: string }[] = [];
const mockRetrySources = jest.fn(async () => undefined);

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/components/GamePickerSheet', () => ({ GamePickerSheet: () => null }));
jest.mock('@/components/ProviderLoginSheet', () => ({ ProviderLoginSheet: () => null }));
jest.mock('@/components/TufPlayerPickerSheet', () => ({ TufPlayerPickerSheet: () => null }));
jest.mock('@/components/PhiraPlayerPickerSheet', () => ({ PhiraPlayerPickerSheet: () => null }));
jest.mock('@/components/MuseDashPlayerPickerSheet', () => ({ MuseDashPlayerPickerSheet: () => null }));
jest.mock('@/components/RenameLocalAccountSheet', () => ({ RenameLocalAccountSheet: () => null }));
jest.mock('@/components/BoundAccountGroupedList', () => ({ BoundAccountGroupedList: () => null }));
jest.mock('@/components/osu/OsuRatingTag', () => ({ OsuRatingTag: () => null }));
jest.mock('@/state/session-store', () => {
  const state = () => ({
    boundAccounts: [],
    activeAccountId: null,
    restoreError: mockRestoreError,
  });
  const useSession = (selector: (value: unknown) => unknown) => selector(state());
  useSession.getState = state;
  return { useSession };
});
jest.mock('@/state/debug-store', () => {
  const state = () => ({ hydrated: true, testAccountsEnabled: false });
  const useDebugStore = (selector: (value: unknown) => unknown) => selector(state());
  useDebugStore.getState = state;
  return { useDebugStore };
});
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({
    showNotification: mockShowNotification,
    showActionNotification: mockShowActionNotification,
  }),
}));
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({ background: '#fff', accent: '#246BFD' }),
}));
jest.mock('@/hooks/use-account-binding-flow', () => ({
  useAccountBindingFlow: () => ({
    expandedPickerGameId: null,
    toggleExpandedPickerGameId: jest.fn(),
    pickerVisible: false,
    loginVisible: false,
    loginProvider: null,
    loginGame: null,
    tufPickerVisible: false,
    museDashPickerVisible: false,
    phiraPickerVisible: false,
    renameAccount: null,
    setRenameAccount: jest.fn(),
    openPicker: jest.fn(),
    openLogin: jest.fn(),
    openPublicPlayer: jest.fn(),
    close: jest.fn(),
    closeLogin: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-managed-account-operations', () => ({
  useManagedAccountOperations: () => ({
    busy: false,
    message: null,
    onSelectAccount: jest.fn(),
    addLocalAccount: jest.fn(),
    addDemoAccount: jest.fn(),
    bindTufPlayer: jest.fn(),
    bindPhiraPlayer: jest.fn(),
    bindMuseDashPlayer: jest.fn(),
    promptRemoveAccount: jest.fn(),
    saveLocalAccountName: jest.fn(),
  }),
}));
jest.mock('@/services/account-restoration', () => ({
  restoreAppAccounts: () => mockRestoreAppAccounts(),
  getAccountSourceStatuses: () => mockSourceStatuses,
  subscribeAccountSourceStatuses: () => () => undefined,
  retryFailedAccountSources: () => mockRetrySources(),
}));
jest.mock('@/storage/secure-session-store', () => ({
  SecureSessionStore: jest.fn(() => ({ clear: mockClearSessions })),
}));

describe('session restore recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRestoreError = '无法读取本机登录状态，请重试恢复。';
    mockSourceStatuses = [];
  });

  it('offers a separate failed-source retry without clearing the existing account list', async () => {
    mockRestoreError = null;
    mockSourceStatuses = [{ source: 'tuf', status: 'failed' }];
    const screen = await render(<GameAccountsScreen />);
    expect(screen.getByText('部分本机账号暂时无法读取，已加载的账号可以继续使用。')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('重试读取账号'));
    expect(mockRetrySources).toHaveBeenCalledTimes(1);
    expect(mockRestoreAppAccounts).not.toHaveBeenCalled();
    expect(mockClearSessions).not.toHaveBeenCalled();
  });

  it('shows retry and clear actions only when restore failed', async () => {
    const failed = await render(<GameAccountsScreen />);
    expect(failed.getByLabelText('重试恢复登录状态')).toBeTruthy();
    expect(failed.getByLabelText('清除登录数据并重新绑定')).toBeTruthy();

    mockRestoreError = null;
    const ready = await render(<GameAccountsScreen />);
    expect(ready.queryByLabelText('重试恢复登录状态')).toBeNull();
    expect(ready.queryByLabelText('清除登录数据并重新绑定')).toBeNull();
  });

  it('retries the restore once per press and unlocks afterwards', async () => {
    const screen = await render(<GameAccountsScreen />);
    await fireEvent.press(screen.getByLabelText('重试恢复登录状态'));
    await waitFor(() => expect(mockRestoreAppAccounts).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByLabelText('重试恢复登录状态'));
    await waitFor(() => expect(mockRestoreAppAccounts).toHaveBeenCalledTimes(2));
  });

  it('confirms before clearing sessions, then reloads and notifies', async () => {
    const screen = await render(<GameAccountsScreen />);
    await fireEvent.press(screen.getByLabelText('清除登录数据并重新绑定'));
    expect(mockClearSessions).not.toHaveBeenCalled();
    expect(mockShowActionNotification).toHaveBeenCalledTimes(1);
    const input = mockShowActionNotification.mock.calls[0][0] as {
      title: string;
      actions: { label: string; tone?: string; onPress?: () => void }[];
    };
    expect(input.title).toBe('清除登录数据');
    const confirm = input.actions.find((action) => action.label === '清除');
    expect(confirm?.tone).toBe('destructive');
    await act(async () => { await confirm?.onPress?.(); });
    await waitFor(() => expect(mockClearSessions).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockRestoreAppAccounts).toHaveBeenCalledTimes(1));
    expect(mockShowNotification).toHaveBeenCalledWith({
      title: '已清除登录数据',
      message: '请重新绑定需要使用的账号。',
      variant: 'info',
    });
  });

  it('keeps recovery available after a failed clear and does not report success', async () => {
    mockClearSessions.mockRejectedValueOnce(new Error('native storage unavailable'));
    const screen = await render(<GameAccountsScreen />);
    await fireEvent.press(screen.getByLabelText('清除登录数据并重新绑定'));
    const input = mockShowActionNotification.mock.calls[0][0] as { actions: { label: string; onPress?: () => void }[] };
    await act(async () => { input.actions.find((action) => action.label === '清除')?.onPress?.(); });
    await waitFor(() => expect(mockShowNotification).toHaveBeenCalledWith({ title: '清除失败', message: '无法清除登录数据，请稍后重试。', variant: 'error' }));
    expect(mockRestoreAppAccounts).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('重试恢复登录状态'));
    await waitFor(() => expect(mockRestoreAppAccounts).toHaveBeenCalledTimes(1));
  });

  it('reloads the empty committed state and reports partial cleanup without retaining the old view', async () => {
    mockClearSessions.mockResolvedValueOnce({ committed: true, cleanupFailures: ['密码', '登录凭据'] });
    const screen = await render(<GameAccountsScreen />);
    await fireEvent.press(screen.getByLabelText('清除登录数据并重新绑定'));
    const input = mockShowActionNotification.mock.calls[0][0] as { actions: { label: string; onPress?: () => void }[] };
    await act(async () => { input.actions.find(action => action.label === '清除')?.onPress?.(); });
    await waitFor(() => expect(mockRestoreAppAccounts).toHaveBeenCalledTimes(1));
    expect(mockShowNotification).toHaveBeenCalledWith({ title: '已清除登录数据', message: '请重新绑定需要使用的账号。密码、登录凭据清理失败。', variant: 'warning' });
  });

  it('does not notify after leaving while a clear is pending', async () => {
    let complete!: () => void;
    const pending = new Promise<void>(resolve => { complete = resolve; });
    mockClearSessions.mockImplementationOnce(async () => { await pending; return { committed: true, cleanupFailures: [] }; });
    const screen = await render(<GameAccountsScreen />);
    await fireEvent.press(screen.getByLabelText('清除登录数据并重新绑定'));
    const input = mockShowActionNotification.mock.calls[0][0] as { actions: { label: string; onPress?: () => void }[] };
    await act(async () => { input.actions.find(action => action.label === '清除')?.onPress?.(); });
    await screen.unmount();
    await act(async () => { complete(); await pending; });
    await waitFor(() => expect(mockRestoreAppAccounts).toHaveBeenCalledTimes(1));
    expect(mockShowNotification).not.toHaveBeenCalled();
  });
});

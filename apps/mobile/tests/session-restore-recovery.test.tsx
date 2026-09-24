import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { GameAccountsScreen } from '@/screens/GameAccountsScreen';

const mockRestoreAppAccounts = jest.fn(async () => undefined);
const mockClearSessions = jest.fn(async () => undefined);
const mockShowNotification = jest.fn();
const mockShowActionNotification = jest.fn();
let mockRestoreError: string | null = '无法读取本机登录状态，当前未加载任何账号';

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
}));
jest.mock('@/storage/secure-session-store', () => ({
  SecureSessionStore: jest.fn(() => ({ clear: mockClearSessions })),
}));

describe('session restore recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRestoreError = '无法读取本机登录状态，当前未加载任何账号';
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
});

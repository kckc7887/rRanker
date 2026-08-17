import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import OsuOAuthCallbackScreen from '../app/oauth/osu';
import { createOsuBoundAccount } from '@/domain/bound-account';

let mockParams: Record<string, string | undefined> = {};
const mockDismissTo = jest.fn((..._args: unknown[]) => undefined);
const mockExchange = jest.fn(async (..._args: unknown[]): Promise<unknown> => undefined);
const mockNotify = jest.fn((..._args: unknown[]) => undefined);

jest.mock('expo-router', () => ({
  router: { dismissTo: (...args: unknown[]) => mockDismissTo(...args) },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

jest.mock('@/providers/osu-oauth', () => ({
  exchangeOsuAuthorizationCode: (...args: unknown[]) => mockExchange(...args),
  notifyOsuOAuthOutcome: (...args: unknown[]) => mockNotify(...args),
}));

const mockBindOsuModes = jest.fn(async (..._args: unknown[]): Promise<unknown> => undefined);
jest.mock('@/services/osu-account-binding', () => ({
  bindOsuModes: (...args: unknown[]) => mockBindOsuModes(...args),
}));

const mockSetOsuBinding = jest.fn();
jest.mock('@/state/session-store', () => ({
  useSession: Object.assign(
    () => undefined,
    {
      getState: () => ({
        boundAccounts: [],
        credentialIdsByAccountId: {},
        setOsuBinding: mockSetOsuBinding,
      }),
    },
  ),
}));

jest.mock('@/state/query-client', () => ({
  queryClient: { invalidateQueries: jest.fn() },
}));

jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    background: '#fff',
    surface: '#fff',
    border: '#ddd',
    text: '#111',
    textMuted: '#777',
    accent: '#246BFD',
  }),
}));

const mockSession = {
  mode: 'osu-oauth',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 900_000,
  persistable: true,
} as const;

const mockAccount = createOsuBoundAccount({
  gameId: 'osu-standard',
  userId: 2,
  displayName: 'peppy',
  pp: 1234,
});

beforeEach(() => {
  mockParams = {};
  mockDismissTo.mockClear();
  mockExchange.mockReset();
  mockNotify.mockClear();
  mockBindOsuModes.mockReset();
  mockSetOsuBinding.mockClear();
});

describe('osu! OAuth 回调页', () => {
  it('换取授权码后通知登录 Sheet 关闭并进入模式选择，绑定选中模式', async () => {
    mockParams = { code: 'auth-code', state: 'expected-state' };
    mockExchange.mockResolvedValue(mockSession);
    mockBindOsuModes.mockResolvedValue({
      accounts: [mockAccount],
      credentialId: 'osu:credential',
      session: mockSession,
      activeAccountId: mockAccount.id,
    });

    await act(async () => { render(<OsuOAuthCallbackScreen />); });

    expect(mockNotify).toHaveBeenCalledWith({ status: 'awaiting-mode-selection' });
    expect(screen.getByText('选择 osu! 模式')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('osu!mania'));
    await waitFor(() => expect(screen.getByLabelText('osu!mania').props.accessibilityState.checked).toBe(true));
    fireEvent.press(screen.getByLabelText('绑定选中模式'));

    await waitFor(() => expect(mockBindOsuModes).toHaveBeenCalledWith({
      modeGameIds: ['osu-mania'],
      session: mockSession,
      existingAccounts: [],
      credentialIdsByAccountId: {},
    }));
    await waitFor(() => expect(mockSetOsuBinding).toHaveBeenCalledWith({
      accounts: [mockAccount],
      credentialId: 'osu:credential',
      session: mockSession,
      activeAccountId: mockAccount.id,
    }));
    await waitFor(() => expect(screen.getByText('授权成功')).toBeTruthy());
    expect(mockNotify).toHaveBeenCalledWith({ status: 'success', accountName: 'peppy' });
  });

  it('返回首页走 dismissTo 回退到既有主页（不再 replace 新建页面）', async () => {
    mockParams = { error: 'access_denied' };

    await act(async () => { render(<OsuOAuthCallbackScreen />); });

    expect(screen.getByText('授权失败')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('返回首页'));
    expect(mockDismissTo).toHaveBeenCalledWith('/');
  });
});

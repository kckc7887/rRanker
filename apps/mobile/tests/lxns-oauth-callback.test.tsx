import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import LxnsOAuthCallbackScreen from '../app/oauth/lxns';
import { createMaimaiBoundAccount } from '@/domain/bound-account';
import { SessionPersistenceError } from '@/domain/session-vault';
import { ProviderError } from '@/providers/errors';

let mockParams: Record<string, string | undefined> = {};
const mockDismissTo = jest.fn((..._args: unknown[]) => undefined);
const mockExchange = jest.fn(async (..._args: unknown[]): Promise<unknown> => undefined);
const mockNotify = jest.fn((..._args: unknown[]) => undefined);

jest.mock('expo-router', () => ({
  router: { dismissTo: (...args: unknown[]) => mockDismissTo(...args) },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/providers/lxns-oauth', () => ({
  exchangeLxnsAuthorizationCode: (...args: unknown[]) => mockExchange(...args),
  requireLxnsOAuthState: (state: unknown) => {
    if (typeof state !== 'string' || !state.trim()) throw new Error('授权状态校验失败，请重新发起授权');
    return state;
  },
  readPendingLxnsOAuth: jest.fn(async () => ({
    verifier: 'verifier',
    state: 'expected-state',
    gameId: 'maimai',
  })),
  notifyLxnsOAuthOutcome: (...args: unknown[]) => mockNotify(...args),
}));

const mockBindLxnsAccount = jest.fn(async (..._args: unknown[]): Promise<unknown> => undefined);
jest.mock('@/services/lxns-account-binding', () => ({
  bindLxnsAccount: (...args: unknown[]) => mockBindLxnsAccount(...args),
}));

const mockSetSession = jest.fn();
const mockRemoveBoundAccount = jest.fn();
jest.mock('@/state/session-store', () => ({
  useSession: Object.assign(
    () => undefined,
    { getState: () => ({ setSession: mockSetSession, removeBoundAccount: mockRemoveBoundAccount }) },
  ),
}));

jest.mock('@/state/query-client', () => ({
  queryClient: { invalidateQueries: jest.fn() },
}));

jest.mock('@/storage/chunithm-temp-account-store', () => ({
  ChunithmTempAccountStore: jest.fn(() => ({ remove: jest.fn(async () => undefined) })),
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

const mockAccount = createMaimaiBoundAccount({
  providerId: 'lxns',
  displayName: '落雪玩家',
  rating: 15000,
  playerId: '12345',
});

const mockSession = {
  mode: 'lxns-oauth',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 900_000,
  persistable: true,
} as const;

beforeEach(() => {
  mockParams = {};
  mockDismissTo.mockClear();
  mockExchange.mockReset();
  mockNotify.mockClear();
  mockBindLxnsAccount.mockReset();
  mockSetSession.mockClear();
  mockRemoveBoundAccount.mockClear();
});

describe('LXNS OAuth 回调页', () => {
  it.each(['credential_storage', 'local_commit'] as const)('真实绑定入口持久化失败显示对应本机阶段：%s', async code => {
    mockParams = { code: 'auth-code', state: 'expected-state' };
    mockExchange.mockResolvedValue(mockSession);
    mockBindLxnsAccount.mockRejectedValue(new SessionPersistenceError(code, { cause: new Error('private native detail') }));
    await act(async () => { render(<LxnsOAuthCallbackScreen />); });
    const copy = code === 'credential_storage'
      ? '无法安全保存账号凭据，请重试；若仍失败，请查看诊断。'
      : '无法保存本机账号信息，请重试；若仍失败，请查看诊断。';
    expect(screen.getByText(copy)).toBeTruthy();
    expect(screen.queryByText(/private native/u)).toBeNull();
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });

  it('远端验证拒绝保持远端阶段，不显示本机保存错误', async () => {
    mockParams = { code: 'auth-code', state: 'expected-state' };
    mockExchange.mockRejectedValue(new ProviderError('authentication', 'raw upstream credential detail', false));
    await act(async () => { render(<LxnsOAuthCallbackScreen />); });
    expect(screen.getByText('远端授权验证未通过，请重新发起授权。')).toBeTruthy();
    expect(mockBindLxnsAccount).not.toHaveBeenCalled();
  });
  it('code 与 state 校验通过后自动绑定并通知成功', async () => {
    mockParams = { code: 'auth-code', state: 'expected-state' };
    mockExchange.mockResolvedValue(mockSession);
    mockBindLxnsAccount.mockResolvedValue({
      account: mockAccount,
      credentialId: 'lxns:credential',
      session: mockSession,
    });

    await act(async () => { render(<LxnsOAuthCallbackScreen />); });

    expect(screen.getByText('授权成功')).toBeTruthy();
    expect(mockExchange).toHaveBeenCalledWith('auth-code', 'expected-state', expect.any(AbortSignal));
    expect(mockBindLxnsAccount).toHaveBeenCalledWith({ gameId: 'maimai', session: mockSession });
    expect(mockSetSession).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith({
      status: 'success',
      gameId: 'maimai',
      accountName: '落雪玩家',
    });
  });

  it('上游返回 error 参数时展示失败并通知错误', async () => {
    mockParams = { error: 'access_denied' };

    await act(async () => { render(<LxnsOAuthCallbackScreen />); });

    expect(screen.getByText('授权失败')).toBeTruthy();
    expect(screen.getByText('落雪授权被拒绝，请重新发起授权')).toBeTruthy();
    expect(mockExchange).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith({
      status: 'error',
      message: '落雪授权被拒绝，请重新发起授权',
    });
  });

  it('缺少进行中的授权信息时提示重新发起', async () => {
    mockParams = { code: 'auth-code', state: 'whatever' };
    const { readPendingLxnsOAuth } = jest.requireMock('@/providers/lxns-oauth') as {
      readPendingLxnsOAuth: ReturnType<typeof jest.fn>;
    };
    readPendingLxnsOAuth.mockResolvedValueOnce(null);

    await act(async () => { render(<LxnsOAuthCallbackScreen />); });

    expect(screen.getByText('授权失败')).toBeTruthy();
    expect(screen.getByText('找不到本机授权信息，请在 App 内重新发起授权')).toBeTruthy();
    expect(mockExchange).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith({
      status: 'error',
      message: '找不到本机授权信息，请在 App 内重新发起授权',
    });
  });

  it('返回首页走 dismissTo 回退到既有主页（不再 replace 新建页面）', async () => {
    mockParams = { code: 'auth-code', state: 'expected-state' };
    mockExchange.mockResolvedValue(mockSession);
    mockBindLxnsAccount.mockResolvedValue({
      account: mockAccount,
      credentialId: 'lxns:credential',
      session: mockSession,
    });

    await act(async () => { render(<LxnsOAuthCallbackScreen />); });

    fireEvent.press(screen.getByLabelText('返回首页'));
    expect(mockDismissTo).toHaveBeenCalledWith('/');
  });
});

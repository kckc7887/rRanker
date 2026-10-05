import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import LxnsOAuthCallbackScreen from '../app/oauth/lxns';
import { createChunithmBoundAccount, createMaimaiBoundAccount } from '@/domain/bound-account';
import { SessionPersistenceError } from '@/domain/session-vault';
import { ProviderError } from '@/providers/errors';

let mockParams: Record<string, string | undefined> = {};
let mockFocused = true;
const mockDismissTo = jest.fn((..._args: unknown[]) => undefined);
const mockExchange = jest.fn(async (..._args: unknown[]): Promise<unknown> => undefined);
const mockNotify = jest.fn((..._args: unknown[]) => undefined);

jest.mock('expo-router', () => ({
  router: { dismissTo: (...args: unknown[]) => mockDismissTo(...args) },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const focused = mockFocused;
    React.useEffect(() => focused ? callback() : undefined, [callback, focused]);
  },
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

const mockSetSession = jest.fn((..._args: unknown[]): unknown => undefined);
const mockRemoveBoundAccount = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockTempRemove = jest.fn(async () => undefined);
jest.mock('@/state/session-store', () => ({
  useSession: Object.assign(
    () => undefined,
    { getState: () => ({ setSession: mockSetSession, removeBoundAccount: mockRemoveBoundAccount }) },
  ),
}));

jest.mock('@/state/query-client', () => ({
  queryClient: { invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args) },
}));

jest.mock('@/storage/chunithm-temp-account-store', () => ({
  ChunithmTempAccountStore: jest.fn(() => ({ remove: () => mockTempRemove() })),
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  mockParams = {};
  mockFocused = true;
  mockDismissTo.mockClear();
  mockExchange.mockReset();
  mockNotify.mockClear();
  mockBindLxnsAccount.mockReset();
  mockSetSession.mockReset();
  mockRemoveBoundAccount.mockClear();
  mockInvalidateQueries.mockClear();
  mockTempRemove.mockClear();
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
    expect(mockBindLxnsAccount).toHaveBeenCalledWith({
      gameId: 'maimai', session: mockSession, signal: expect.any(AbortSignal), assertCurrent: expect.any(Function),
    });
    expect(mockSetSession).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith({
      status: 'success',
      gameId: 'maimai',
      accountName: '落雪玩家',
    });
  });

  it.each([
    ['maimai', '卸载'], ['maimai', '失焦'], ['chunithm', '卸载'], ['chunithm', '失焦'],
  ] as const)('%s 回调页%s后忽略绑定迟到结果及全部页面动作', async (gameId, exit) => {
    const binding = deferred<unknown>();
    mockParams = { code: 'auth-code', state: 'expected-state', gameId };
    const { readPendingLxnsOAuth } = jest.requireMock('@/providers/lxns-oauth') as { readPendingLxnsOAuth: ReturnType<typeof jest.fn> };
    readPendingLxnsOAuth.mockResolvedValueOnce({ verifier: 'verifier', state: 'expected-state', gameId });
    mockExchange.mockResolvedValue(mockSession);
    mockBindLxnsAccount.mockReturnValue(binding.promise);
    const rendered = await render(<LxnsOAuthCallbackScreen />);
    await waitFor(() => expect(mockBindLxnsAccount).toHaveBeenCalledTimes(1));
    const input = mockBindLxnsAccount.mock.calls[0][0] as { signal: AbortSignal; assertCurrent: () => void };
    if (exit === '卸载') await rendered.unmount();
    else { mockFocused = false; await rendered.rerender(<LxnsOAuthCallbackScreen />); }
    expect(input.signal.aborted).toBe(true);
    expect(input.assertCurrent).toThrow();
    await act(async () => binding.resolve({
      account: gameId === 'maimai' ? mockAccount : createChunithmBoundAccount({
        displayName: '中二玩家', rating: 16, playerId: '12345',
      }),
      credentialId: 'lxns:credential', session: mockSession,
    }));
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockRemoveBoundAccount).not.toHaveBeenCalled();
    expect(mockTempRemove).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('激活已开始后退出阻止中二临时账号清理及成功提示', async () => {
    const activation = deferred<void>();
    mockParams = { code: 'auth-code', state: 'expected-state', gameId: 'chunithm' };
    const { readPendingLxnsOAuth } = jest.requireMock('@/providers/lxns-oauth') as { readPendingLxnsOAuth: ReturnType<typeof jest.fn> };
    readPendingLxnsOAuth.mockResolvedValueOnce({ verifier: 'verifier', state: 'expected-state', gameId: 'chunithm' });
    mockExchange.mockResolvedValue(mockSession);
    mockBindLxnsAccount.mockResolvedValue({
      account: createChunithmBoundAccount({ displayName: '中二玩家', rating: 16, playerId: '12345' }),
      credentialId: 'lxns:credential', session: mockSession,
    });
    mockSetSession.mockReturnValue(activation.promise);
    const rendered = await render(<LxnsOAuthCallbackScreen />);
    await waitFor(() => expect(mockSetSession).toHaveBeenCalledTimes(1));
    await rendered.unmount();
    await act(async () => activation.resolve());
    expect(mockRemoveBoundAccount).not.toHaveBeenCalled();
    expect(mockTempRemove).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
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

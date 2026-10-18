import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { AppState, type AppStateStatus } from 'react-native';
import OsuOAuthCallbackScreen from '../app/oauth/osu';
import { createOsuBoundAccount } from '@/domain/bound-account';
import { ProviderError } from '@/providers/errors';
import { AppLifecycleProvider } from '@/state/app-lifecycle';

let mockParams: Record<string, string | undefined> = {};
let mockFocused = true;
const mockDismissTo = jest.fn((..._args: unknown[]) => undefined);
const mockExchange = jest.fn(async (..._args: unknown[]): Promise<unknown> => undefined);
const mockNotify = jest.fn((..._args: unknown[]) => undefined);
const mockRequireState = jest.fn((state: unknown) => {
  if (typeof state !== 'string' || state.length === 0) throw new Error('missing oauth state');
  return state;
});

jest.mock('expo-router', () => ({
  router: { dismissTo: (...args: unknown[]) => mockDismissTo(...args) },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => (() => void) | undefined) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const focused = mockFocused;
    React.useEffect(() => focused ? effect() : undefined, [effect, focused]);
  },
}));

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

jest.mock('@/providers/osu-oauth', () => ({
  exchangeOsuAuthorizationCode: (...args: unknown[]) => mockExchange(...args),
  notifyOsuOAuthOutcome: (...args: unknown[]) => mockNotify(...args),
  requireOsuOAuthState: (state: unknown) => mockRequireState(state),
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
  mockFocused = true;
  mockDismissTo.mockClear();
  mockExchange.mockReset();
  mockNotify.mockClear();
  mockRequireState.mockClear();
  mockBindOsuModes.mockReset();
  mockSetOsuBinding.mockClear();
});

describe('osu! OAuth 回调页', () => {
  describe('浏览器返回时的前后台切换', () => {
    const originalAppState = AppState.currentState;
    const originalIdle = globalThis.requestIdleCallback;
    const originalCancelIdle = globalThis.cancelIdleCallback;
    let changeAppState: ((state: AppStateStatus) => void) | undefined;
    let enterForeground: (() => void) | undefined;

    beforeEach(() => {
      AppState.currentState = 'background';
      changeAppState = undefined;
      enterForeground = undefined;
      jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
        if (type === 'change') changeAppState = listener;
        return { remove: jest.fn() };
      });
      globalThis.requestIdleCallback = callback => {
        enterForeground = () => callback({ didTimeout: false, timeRemaining: () => 50 });
        return 1;
      };
      globalThis.cancelIdleCallback = () => { enterForeground = undefined; };
      mockParams = { code: 'auth-code', state: 'expected-state' };
    });

    afterEach(() => {
      jest.restoreAllMocks();
      AppState.currentState = originalAppState;
      globalThis.requestIdleCallback = originalIdle;
      globalThis.cancelIdleCallback = originalCancelIdle;
    });

    it('回调先到达后台，恢复前台后继续换码并显示模式选择', async () => {
      mockExchange.mockResolvedValue(mockSession);
      await render(<AppLifecycleProvider><OsuOAuthCallbackScreen /></AppLifecycleProvider>);
      expect(mockExchange).not.toHaveBeenCalled();
      await act(() => { changeAppState?.('active'); });
      expect(mockExchange).not.toHaveBeenCalled();
      await act(() => { enterForeground?.(); });
      expect(screen.getByText('选择 osu! 模式')).toBeTruthy();
    });

    it('换码尚未完成时已通知关闭登录弹层，短暂失活后继续显示结果', async () => {
      let resolve!: (value: unknown) => void;
      mockExchange.mockImplementation(() => new Promise(done => { resolve = done; }));
      await render(<AppLifecycleProvider><OsuOAuthCallbackScreen /></AppLifecycleProvider>);
      await act(() => { changeAppState?.('active'); });
      await act(() => { enterForeground?.(); });
      expect(mockNotify).toHaveBeenCalledWith({ status: 'callback-received' });
      expect(screen.getByText('正在换取令牌，请稍候。')).toBeTruthy();
      const signal = mockExchange.mock.calls[0][2] as AbortSignal;
      await act(() => { changeAppState?.('inactive'); });
      expect(signal.aborted).toBe(false);
      await act(() => { changeAppState?.('active'); });
      await act(() => { enterForeground?.(); });
      await act(() => resolve(mockSession));
      expect(screen.getByText('选择 osu! 模式')).toBeTruthy();
    });

    it.each(['换码', '绑定'])('%s期间进入后台显示取消，恢复后忽略迟到结果', async stage => {
      let resolve!: (value: unknown) => void;
      const pending = new Promise(done => { resolve = done; });
      mockExchange.mockReturnValue(stage === '换码' ? pending : Promise.resolve(mockSession));
      mockBindOsuModes.mockReturnValue(pending);
      await render(<AppLifecycleProvider><OsuOAuthCallbackScreen /></AppLifecycleProvider>);
      await act(() => { changeAppState?.('active'); });
      await act(() => { enterForeground?.(); });
      if (stage === '绑定') {
        await fireEvent.press(screen.getByLabelText('osu!mania'));
        await fireEvent.press(screen.getByLabelText('绑定选中模式'));
      }
      const signal = stage === '换码'
        ? mockExchange.mock.calls[0][2] as AbortSignal
        : (mockBindOsuModes.mock.calls[0][0] as { signal: AbortSignal }).signal;
      await act(() => { changeAppState?.('background'); });
      expect(signal.aborted).toBe(true);
      expect(screen.getByText('操作已取消，请重新发起授权。')).toBeTruthy();
      await act(() => { changeAppState?.('active'); });
      await act(() => { enterForeground?.(); });
      await act(() => resolve(stage === '换码' ? mockSession : {
        accounts: [mockAccount], credentialId: 'c', session: mockSession, activeAccountId: mockAccount.id,
      }));
      expect(screen.getByText('操作已取消，请重新发起授权。')).toBeTruthy();
      expect(mockSetOsuBinding).not.toHaveBeenCalled();
      expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    });

    it.each(['blur', 'unmount'])('等待恢复前台时%s，之后不再消费授权码', async leave => {
      const content = <AppLifecycleProvider><OsuOAuthCallbackScreen /></AppLifecycleProvider>;
      const view = await render(content);
      if (leave === 'blur') {
        mockFocused = false;
        await view.rerender(<AppLifecycleProvider><OsuOAuthCallbackScreen /></AppLifecycleProvider>);
      } else {
        await view.unmount();
      }
      await act(() => { changeAppState?.('active'); });
      await act(() => { enterForeground?.(); });
      if (leave === 'blur') {
        mockFocused = true;
        await view.rerender(content);
        expect(screen.getByText('操作已取消，请重新发起授权。')).toBeTruthy();
      }
      expect(mockExchange).not.toHaveBeenCalled();
      expect(mockNotify).not.toHaveBeenCalled();
    });
  });

  it.each(['blur', 'unmount'])('%s 后取消绑定，忽略迟到结果与页面通知', async leave => {
    mockParams = { code: 'auth-code', state: 'expected-state' };
    mockExchange.mockResolvedValue(mockSession);
    let resolve!: (value: unknown) => void;
    mockBindOsuModes.mockImplementation(() => new Promise(done => { resolve = done; }));
    const view = await render(<OsuOAuthCallbackScreen />);
    await fireEvent.press(screen.getByLabelText('osu!mania'));
    await fireEvent.press(screen.getByLabelText('绑定选中模式'));
    await waitFor(() => expect(mockBindOsuModes).toHaveBeenCalledTimes(1));
    const input = mockBindOsuModes.mock.calls[0][0] as { signal?: AbortSignal };
    if (leave === 'blur') {
      mockFocused = false;
      await view.rerender(<OsuOAuthCallbackScreen />);
    } else await view.unmount();
    expect(input.signal?.aborted).toBe(true);
    await act(() => resolve({ accounts: [mockAccount], credentialId: 'c', session: mockSession, activeAccountId: mockAccount.id }));
    expect(mockSetOsuBinding).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });
  it('构建缺少应用凭据时直接显示配置阶段', async () => {
    mockParams = { code: 'auth-code', state: 'expected-state' };
    mockExchange.mockRejectedValue(new ProviderError('configuration', 'raw configuration details', false));
    await render(<OsuOAuthCallbackScreen />);
    expect(screen.getByText('当前构建缺少应用凭据，无法完成授权。')).toBeTruthy();
    expect(mockBindOsuModes).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });
  it('收到回调后通知关闭登录弹层，换码成功后绑定选中模式', async () => {
    mockParams = { code: 'auth-code', state: 'expected-state' };
    mockExchange.mockResolvedValue(mockSession);
    mockBindOsuModes.mockResolvedValue({
      accounts: [mockAccount],
      credentialId: 'osu:credential',
      session: mockSession,
      activeAccountId: mockAccount.id,
    });

    await render(<OsuOAuthCallbackScreen />);

    expect(mockNotify).toHaveBeenCalledWith({ status: 'callback-received' });
    expect(screen.getByText('选择 osu! 模式')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('osu!mania'));
    await waitFor(() => expect(screen.getByLabelText('osu!mania').props.accessibilityState.checked).toBe(true));
    await fireEvent.press(screen.getByLabelText('绑定选中模式'));

    await waitFor(() => expect(mockBindOsuModes).toHaveBeenCalledWith(expect.objectContaining({
      modeGameIds: ['osu-mania'],
      session: mockSession,
      existingAccounts: [],
      credentialIdsByAccountId: {},
    })));
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

    await render(<OsuOAuthCallbackScreen />);

    expect(screen.getByText('授权失败')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('返回首页'));
    expect(mockDismissTo).toHaveBeenCalledWith('/');
  });
});

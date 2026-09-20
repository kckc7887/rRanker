import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Linking } from 'react-native';
import { ProviderLoginSheet } from '@/components/ProviderLoginSheet';
import { findGame } from '@/domain/game-bind-options';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle';

let mockLifecycle: AppLifecycleSnapshot = {
  appState: 'active', phase: 'foreground-ready', foregroundReady: true,
  foregroundGeneration: 1, memoryWarningGeneration: 0,
};

jest.mock('@/state/app-lifecycle', () => ({
  useAppLifecycle: () => mockLifecycle,
  getForegroundAbortSignal: () => new AbortController().signal,
  getAppLifecycleSnapshot: () => mockLifecycle,
}));

const phiProvider = findGame('phigros')?.providers.find((p) => p.id === 'phi-taptap') ?? null;

const mockDevice = {
  deviceCode: 'dc-1',
  qrcodeUrl: 'https://example.com/authorize',
  deviceId: 'dev-1',
  expiresIn: 300,
  interval: 5,
};

const mockSession = {
  mode: 'phi-session',
  sessionToken: 'st-1',
  playerId: 'player-1',
  persistable: true,
} as const;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    background: '#fff',
    surface: '#fff',
    surfaceMuted: '#f5f5f5',
    input: '#fff',
    border: '#ddd',
    text: '#111',
    textSecondary: '#444',
    textMuted: '#777',
    accent: '#246BFD',
  }),
}));
jest.mock('@/storage/secure-session-store', () => ({
  SecureSessionStore: jest.fn(() => ({ upsertAccount: jest.fn(async () => undefined) })),
}));
jest.mock('@/storage/chunithm-temp-account-store', () => ({
  ChunithmTempAccountStore: jest.fn(() => ({ remove: jest.fn(async () => undefined) })),
}));
jest.mock('@/state/query-client', () => ({
  queryClient: { invalidateQueries: jest.fn() },
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: Record<string, unknown>) => unknown) => selector({
    boundAccounts: [],
    sessionsByAccountId: {},
    credentialIdsByAccountId: {},
    setSession: jest.fn(),
    removeBoundAccount: jest.fn(),
  }),
}));
jest.mock('@/providers/phigros-score-provider', () => ({
  PhigrosScoreProvider: {
    beginLogin: jest.fn(),
    pollLogin: jest.fn(),
  },
}));

const beginLoginMock = (PhigrosScoreProvider.beginLogin as unknown as jest.Mock<any>);
const pollLoginMock = (PhigrosScoreProvider.pollLogin as unknown as jest.Mock<any>);

type Screen = Awaited<ReturnType<typeof render>>;

function LoginSheet({ onSuccess = () => undefined }: { onSuccess?: () => void }) {
  return <ProviderLoginSheet
    visible provider={phiProvider} gameId="phigros" gameTitle="Phigros"
    onClose={() => undefined} onSuccess={onSuccess}
  />;
}

describe('ProviderLoginSheet Phigros polling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockLifecycle = {
      appState: 'active', phase: 'foreground-ready', foregroundReady: true,
      foregroundGeneration: 1, memoryWarningGeneration: 0,
    };
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    beginLoginMock.mockClear();
    pollLoginMock.mockClear();
    beginLoginMock.mockResolvedValue(mockDevice);
    pollLoginMock.mockResolvedValue('pending');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const startLogin = async (screen: Screen) => {
    const button = screen.getByText('开始绑定');
    await act(async () => {
      fireEvent.press(button);
    });
    await waitFor(() => expect(screen.getByText('取消授权')).toBeTruthy());
    expect(beginLoginMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('TapTap 授权二维码')).toBeTruthy();
    await waitFor(() => expect(pollLoginMock).toHaveBeenCalled());
  };

  it('requests a device code without opening TapTap until the authorize button is pressed', async () => {
    const screen = await render(<LoginSheet />);
    await startLogin(screen);

    expect(Linking.openURL).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByText('前往 TapTap 授权'));
    });
    expect(Linking.openURL).toHaveBeenCalledWith(
      `taptap://taptap.com/to?url=${encodeURIComponent(mockDevice.qrcodeUrl)}`,
    );

    await screen.unmount();
  });

  it('stops polling while backgrounded and polls immediately on return', async () => {
    const screen = await render(<LoginSheet />);
    await startLogin(screen);
    expect(pollLoginMock).toHaveBeenCalledTimes(1);

    await act(async () => { jest.advanceTimersByTime(5_000); });
    expect(pollLoginMock).toHaveBeenCalledTimes(2);

    mockLifecycle = { ...mockLifecycle, appState: 'background', phase: 'background', foregroundReady: false };
    await screen.rerender(<LoginSheet />);
    await act(async () => { jest.advanceTimersByTime(20_000); });
    expect(pollLoginMock).toHaveBeenCalledTimes(2);

    mockLifecycle = { ...mockLifecycle, appState: 'active', phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 2 };
    await screen.rerender(<LoginSheet />);
    expect(pollLoginMock).toHaveBeenCalledTimes(3);

    await act(async () => { jest.advanceTimersByTime(5_000); });
    expect(pollLoginMock).toHaveBeenCalledTimes(4);

    await screen.unmount();
  });

  it('stops polling while inactive and resumes without a generation bump', async () => {
    const screen = await render(<LoginSheet />);
    await startLogin(screen);
    expect(pollLoginMock).toHaveBeenCalledTimes(1);

    mockLifecycle = { ...mockLifecycle, appState: 'inactive', phase: 'inactive', foregroundReady: false };
    await screen.rerender(<LoginSheet />);
    await act(async () => { jest.advanceTimersByTime(20_000); });
    expect(pollLoginMock).toHaveBeenCalledTimes(1);

    mockLifecycle = { ...mockLifecycle, appState: 'active', phase: 'foreground-ready', foregroundReady: true };
    await screen.rerender(<LoginSheet />);
    expect(pollLoginMock).toHaveBeenCalledTimes(2);

    await screen.unmount();
  });

  it('keeps polling after a transient network failure and completes binding', async () => {
    pollLoginMock
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(mockSession);

    const onSuccess = jest.fn();
    const screen = await render(<LoginSheet onSuccess={onSuccess} />);
    await startLogin(screen);
    await waitFor(() => expect(screen.getByText('网络波动，自动重试中…')).toBeTruthy());

    await act(async () => { jest.advanceTimersByTime(5_000); });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(pollLoginMock).toHaveBeenCalledTimes(2);

    await screen.unmount();
  });

  it('stops polling on fatal protocol errors while in the foreground', async () => {
    pollLoginMock.mockRejectedValueOnce(new Error('access_denied'));

    const screen = await render(<LoginSheet />);
    await startLogin(screen);
    await waitFor(() => expect(screen.getByText('授权失败，请重新尝试。')).toBeTruthy());
    expect(screen.queryByText(/access_denied/)).toBeNull();

    await act(async () => { jest.advanceTimersByTime(20_000); });
    expect(pollLoginMock).toHaveBeenCalledTimes(1);

    await screen.unmount();
  });

  it('does not treat a poll error after leaving the foreground as login failure', async () => {
    let rejectPoll: ((error: Error) => void) | undefined;
    pollLoginMock.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectPoll = reject;
    }));

    const screen = await render(<LoginSheet />);
    await startLogin(screen);
    await waitFor(() => expect(rejectPoll).toBeDefined());

    mockLifecycle = { ...mockLifecycle, appState: 'inactive', phase: 'inactive', foregroundReady: false };
    await screen.rerender(<LoginSheet />);
    await act(async () => { rejectPoll?.(new Error('access_denied')); });

    expect(screen.queryByText('授权失败，请重新尝试。')).toBeNull();
    expect(screen.queryByText(/access_denied/)).toBeNull();

    await screen.unmount();
  });
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { AppState, InteractionManager, Linking } from 'react-native';
import { ProviderLoginSheet } from '@/components/ProviderLoginSheet';
import { findGame } from '@/domain/game-bind-options';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';

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

let appStateListener: ((state: string) => void) | null = null;

type Screen = Awaited<ReturnType<typeof render>>;

describe('ProviderLoginSheet Phigros polling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    appStateListener = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      handler: (state: string) => void,
    ) => {
      appStateListener = handler;
      return { remove: jest.fn() };
    }) as never);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
      (callback as () => void)();
      return { cancel: jest.fn() } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
    });
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
    const button = screen.getByText('前往 TapTap 授权');
    await act(async () => {
      fireEvent.press(button);
    });
    await waitFor(() => expect(screen.getByText('取消授权')).toBeTruthy());
    expect(beginLoginMock).toHaveBeenCalledTimes(1);
  };

  it('stops polling while backgrounded and polls immediately on return', async () => {
    const screen = await render(
      <ProviderLoginSheet
        visible
        provider={phiProvider}
        gameId="phigros"
        gameTitle="Phigros"
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    await startLogin(screen);

    await act(async () => { jest.advanceTimersByTime(5_000); });
    expect(pollLoginMock).toHaveBeenCalledTimes(1);

    appStateListener?.('background');
    await act(async () => { jest.advanceTimersByTime(20_000); });
    expect(pollLoginMock).toHaveBeenCalledTimes(1);

    await act(async () => { appStateListener?.('active'); });
    expect(pollLoginMock).toHaveBeenCalledTimes(2);

    await act(async () => { jest.advanceTimersByTime(5_000); });
    expect(pollLoginMock).toHaveBeenCalledTimes(3);

    await screen.unmount();
  });

  it('keeps polling after a transient network failure and completes binding', async () => {
    pollLoginMock
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(mockSession);

    const onSuccess = jest.fn();
    const screen = await render(
      <ProviderLoginSheet
        visible
        provider={phiProvider}
        gameId="phigros"
        gameTitle="Phigros"
        onClose={() => undefined}
        onSuccess={onSuccess}
      />,
    );
    await startLogin(screen);

    await act(async () => { appStateListener?.('active'); });
    expect(screen.getAllByText('网络波动，自动重试中…').length).toBeGreaterThan(0);

    await act(async () => { jest.advanceTimersByTime(5_000); });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(pollLoginMock).toHaveBeenCalledTimes(2);

    await screen.unmount();
  });

  it('stops polling on fatal protocol errors', async () => {
    pollLoginMock.mockRejectedValueOnce(new Error('access_denied'));

    const screen = await render(
      <ProviderLoginSheet
        visible
        provider={phiProvider}
        gameId="phigros"
        gameTitle="Phigros"
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    await startLogin(screen);

    await act(async () => { appStateListener?.('active'); });
    expect(screen.getAllByText('授权失败，请重新尝试。').length).toBeGreaterThan(0);
    expect(screen.queryByText(/access_denied/)).toBeNull();

    await act(async () => { jest.advanceTimersByTime(20_000); });
    expect(pollLoginMock).toHaveBeenCalledTimes(1);

    await screen.unmount();
  });
});

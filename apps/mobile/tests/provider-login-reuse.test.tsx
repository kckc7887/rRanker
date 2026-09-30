import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { ProviderLoginSheet } from '@/components/ProviderLoginSheet';
import { LxnsLoginPanel } from '@/components/LxnsLoginPanel';
import { createChunithmBoundAccount, createMaimaiBoundAccount } from '@/domain/bound-account';
import { findGame } from '@/domain/game-bind-options';

const mockMaimai = createMaimaiBoundAccount({
  providerId: 'lxns',
  displayName: '已有舞萌玩家',
  rating: 15000,
  playerId: '1',
});
const mockOauth = {
  mode: 'lxns-oauth',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 60_000,
  persistable: true,
} as const;
const mockSetSession = jest.fn((..._args: unknown[]): unknown => undefined);
const mockRemoveBoundAccount = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockTempRemove = jest.fn(async () => undefined);
const mockBind = jest.fn(async (..._args: unknown[]): Promise<unknown> => undefined);
let mockLifecycle = { phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 1 };
jest.mock('@/state/app-lifecycle', () => ({ useAppLifecycle: () => mockLifecycle }));
jest.mock('@/services/lxns-account-binding', () => ({ bindLxnsAccount: (...args: unknown[]) => mockBind(...args) }));

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
  SecureSessionStore: jest.fn(() => ({ upsertAccounts: jest.fn() })),
}));
jest.mock('@/storage/chunithm-temp-account-store', () => ({
  ChunithmTempAccountStore: jest.fn(() => ({ remove: () => mockTempRemove() })),
}));
jest.mock('@/state/query-client', () => ({
  queryClient: { invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args) },
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: Record<string, unknown>) => unknown) => selector({
    boundAccounts: [mockMaimai],
    sessionsByAccountId: { [mockMaimai.id]: mockOauth },
    credentialIdsByAccountId: { [mockMaimai.id]: 'lxns:shared' },
    setSession: mockSetSession,
    removeBoundAccount: mockRemoveBoundAccount,
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const binding = () => ({
  account: createChunithmBoundAccount({ displayName: '中二玩家', rating: 16, playerId: '2' }),
  session: mockOauth, credentialId: 'lxns:shared',
});

beforeEach(() => {
  mockLifecycle = { phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 1 };
  mockBind.mockReset(); mockSetSession.mockReset(); mockRemoveBoundAccount.mockClear();
  mockInvalidateQueries.mockClear(); mockTempRemove.mockClear();
});

describe('ProviderLoginSheet LXNS account reuse', () => {
  it('shows one reuse entry below Chunithm login and expands the eligible account', async () => {
    const provider = findGame('chunithm')?.providers[0] ?? null;
    const screen = await render(
      <ProviderLoginSheet
        visible
        provider={provider}
        gameId="chunithm"
        gameTitle="中二节奏"
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );

    const reuse = screen.getByLabelText('使用已有落雪账号');
    expect(reuse).toBeTruthy();
    fireEvent.press(reuse);
    await waitFor(() => expect(screen.getByText('已有舞萌玩家')).toBeTruthy());
    expect(screen.getByText('已绑定舞萌 DX')).toBeTruthy();
  });

  it('复用入口通过取消守卫提交并激活成功绑定', async () => {
    const onSuccess = jest.fn();
    const pending = deferred<unknown>();
    mockBind.mockReturnValue(pending.promise);
    const screen = await render(<LxnsLoginPanel visible gameId="chunithm" gameTitle="中二节奏"
      onSuccess={onSuccess} onBusyChange={() => undefined} />);
    fireEvent.press(screen.getByLabelText('使用已有落雪账号'));
    await waitFor(() => expect(screen.getByLabelText('使用已有落雪账号 已有舞萌玩家')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('使用已有落雪账号 已有舞萌玩家'));
    await waitFor(() => expect(mockBind).toHaveBeenCalledTimes(1));
    await act(async () => pending.resolve(binding()));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockBind).toHaveBeenCalledWith({ gameId: 'chunithm', session: mockOauth,
      credentialId: 'lxns:shared', signal: expect.any(AbortSignal), assertCurrent: expect.any(Function) });
    expect(mockSetSession).toHaveBeenCalledTimes(1);
    expect(mockRemoveBoundAccount).toHaveBeenCalledTimes(1);
    expect(mockTempRemove).toHaveBeenCalledTimes(1);
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(3);
  });

  it.each(['隐藏', '卸载', '后台'] as const)('复用绑定在%s后忽略迟到完成结果', async exit => {
    const pending = deferred<unknown>(); const onSuccess = jest.fn();
    mockBind.mockReturnValue(pending.promise);
    const panel = (visible: boolean) => <LxnsLoginPanel visible={visible} gameId="chunithm" gameTitle="中二节奏"
      onSuccess={onSuccess} onBusyChange={() => undefined} />;
    const screen = await render(panel(true));
    fireEvent.press(screen.getByLabelText('使用已有落雪账号'));
    await waitFor(() => expect(screen.getByLabelText('使用已有落雪账号 已有舞萌玩家')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('使用已有落雪账号 已有舞萌玩家'));
    await waitFor(() => expect(mockBind).toHaveBeenCalledTimes(1));
    const input = mockBind.mock.calls[0][0] as { signal: AbortSignal; assertCurrent: () => void };
    if (exit === '卸载') await screen.unmount();
    else {
      if (exit === '后台') mockLifecycle = { ...mockLifecycle, phase: 'background', foregroundReady: false };
      await screen.rerender(panel(exit !== '隐藏'));
    }
    expect(input.signal.aborted).toBe(true); expect(input.assertCurrent).toThrow();
    await act(async () => pending.resolve(binding()));
    expect(mockSetSession).not.toHaveBeenCalled(); expect(mockRemoveBoundAccount).not.toHaveBeenCalled();
    expect(mockTempRemove).not.toHaveBeenCalled(); expect(mockInvalidateQueries).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

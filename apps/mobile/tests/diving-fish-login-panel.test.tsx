import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { DivingFishLoginPanel } from '@/components/maimai/DivingFishLoginPanel';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle';
import type { Player } from '@/domain/models';
import type { ProviderSession } from '@/providers/contracts';

let mockLifecycle: AppLifecycleSnapshot;
const mockSetSession = jest.fn();
const mockSave = jest.fn<(account: unknown, signal?: AbortSignal) => Promise<string>>();
const mockPlayer = jest.fn<(signal?: AbortSignal) => Promise<Player>>();
const mockRecords = jest.fn(async (_signal?: AbortSignal) => []);
const mockLogin = jest.fn<(credentials: unknown, signal?: AbortSignal) => Promise<ProviderSession>>();
const session: ProviderSession = { mode: 'import-token', value: 'token', persistable: true };
const player: Player = { id: 'player', displayName: '玩家', rating: 15000,
  source: { kind: 'diving-fish', label: '水鱼', updatedAt: '', isStale: false } };

jest.mock('@/state/app-lifecycle', () => ({ useAppLifecycle: () => mockLifecycle }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({ text: '#111', textMuted: '#777', input: '#fff', border: '#ddd', accent: '#246BFD' }) }));
jest.mock('@/state/query-client', () => ({ queryClient: { invalidateQueries: jest.fn(async () => undefined) } }));
jest.mock('@/state/session-store', () => ({ useSession: (select: (state: unknown) => unknown) => select({ setSession: mockSetSession }) }));
jest.mock('@/storage/secure-session-store', () => ({ SecureSessionStore: class { upsertAccount = (...args: Parameters<typeof mockSave>) => mockSave(...args); } }));
jest.mock('@/providers/diving-fish-provider', () => ({ DivingFishProvider: class {
  getPlayer = (signal?: AbortSignal) => mockPlayer(signal);
  getRecords = (signal?: AbortSignal) => mockRecords(signal);
} }));
jest.mock('@/providers/diving-fish-auth', () => ({ DivingFishAuthProvider: class {
  loginWithPassword = (...args: Parameters<typeof mockLogin>) => mockLogin(...args);
  useImportToken = () => session;
} }));
jest.mock('@/screens/game-accounts-actions', () => ({ cancelBoundAccountQueries: jest.fn(async () => undefined) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockLifecycle = { appState: 'active', phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 1, memoryWarningGeneration: 0 };
  mockSave.mockResolvedValue('credential'); mockPlayer.mockResolvedValue(player); mockLogin.mockResolvedValue(session);
});

function panel(visible: boolean, onSuccess: () => void) {
  return <DivingFishLoginPanel visible={visible} onSuccess={onSuccess} onBusyChange={jest.fn()} />;
}

describe('水鱼绑定请求寿命', () => {
  it.each(['hide', 'background', 'unmount'])('rejects late validated credentials after %s', async transition => {
    let release!: (value: Player) => void;
    mockPlayer.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const success = jest.fn(); const screen = await render(panel(true, success));
    await fireEvent.changeText(screen.getByPlaceholderText('上传凭证'), 'token');
    await fireEvent.press(screen.getByText('验证并保存凭证'));
    await waitFor(() => expect(mockPlayer).toHaveBeenCalledTimes(1));
    const signal = mockPlayer.mock.calls[0]![0]!;
    if (transition === 'unmount') await screen.unmount();
    else {
      if (transition === 'background') mockLifecycle = { ...mockLifecycle, phase: 'background', foregroundReady: false, appState: 'background' };
      await screen.rerender(panel(transition !== 'hide', success));
    }
    expect(signal.aborted).toBe(true);
    await act(async () => { release(player); });
    expect(mockSave).not.toHaveBeenCalled(); expect(mockSetSession).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled();
  });

  it('keeps a newer reopened login when an older validation completes', async () => {
    let release!: (value: Player) => void;
    mockPlayer.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const success = jest.fn(); const screen = await render(panel(true, success));
    await fireEvent.press(screen.getByText('验证并保存凭证'));
    await waitFor(() => expect(mockPlayer).toHaveBeenCalledTimes(1));
    await screen.rerender(panel(false, success)); await screen.rerender(panel(true, success));
    await fireEvent.press(screen.getByText('验证并保存凭证'));
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    await act(async () => { release({ ...player, id: 'old', displayName: '旧玩家' }); });
    expect(mockSave).toHaveBeenCalledTimes(1); expect(mockSetSession).toHaveBeenCalledTimes(1);
    expect(mockSetSession.mock.calls[0]![1]).toMatchObject({ playerId: 'player' });
    expect(success).toHaveBeenCalledTimes(1);
  });

  it('cancels persistence as well as validation and prevents late activation', async () => {
    let finishSave!: (value: string) => void;
    mockSave.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
    const success = jest.fn(); const screen = await render(panel(true, success));
    await fireEvent.press(screen.getByText('验证并保存凭证'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    const signal = mockSave.mock.calls[0]![1]!;
    await screen.rerender(panel(false, success));
    expect(signal.aborted).toBe(true);
    await act(async () => { finishSave('credential'); });
    expect(mockSetSession).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled();
  });
});

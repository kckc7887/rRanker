import { useAccountStore } from '@rranker/sdk/state/account-store';
import type { Credential } from '@rranker/sdk/credentials';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { DivingFishLoginPanel } from '@rranker/provider-diving-fish/components/maimai/DivingFishLoginPanel';
import type { AppLifecycleSnapshot } from '@rranker/sdk/state/app-lifecycle';
import type { Player } from '@rranker/game-maimai/domain/models';


let mockLifecycle: AppLifecycleSnapshot;
const initial = useAccountStore.getState();
const mockSave = jest.fn<(account: unknown, signal?: AbortSignal) => Promise<string>>();
const mockPlayer = jest.fn<(signal?: AbortSignal) => Promise<Player>>();
const mockRecords = jest.fn(async (_signal?: AbortSignal) => []);
const mockLogin = jest.fn<(credentials: unknown, signal?: AbortSignal) => Promise<Credential>>();
const session: Credential = { mode: 'import-token', value: 'token', persistable: true };
const player: Player = { id: 'player', displayName: '玩家', rating: 15000,
  source: { kind: 'diving-fish', label: '水鱼', updatedAt: '', isStale: false } };

jest.mock('@rranker/sdk/state/app-lifecycle', () => ({ useAppLifecycle: () => mockLifecycle }));
jest.mock('@rranker/sdk/theme/app-theme', () => ({ useAppTheme: () => ({ text: '#111', textMuted: '#777', input: '#fff', border: '#ddd', accent: '#246BFD' }) }));
jest.mock('@rranker/sdk/state/query-client', () => ({ queryClient: { invalidateQueries: jest.fn(async () => undefined) } }));
jest.mock('@rranker/sdk/storage/secure-session-store', () => ({ SecureSessionStore: class { upsertAccount = (...args: Parameters<typeof mockSave>) => mockSave(...args); } }));
jest.mock('@rranker/provider-diving-fish/providers/diving-fish-provider', () => ({ DivingFishProvider: class {
  getPlayer = (signal?: AbortSignal) => mockPlayer(signal);
  getRecords = (signal?: AbortSignal) => mockRecords(signal);
} }));
jest.mock('@rranker/provider-diving-fish/providers/diving-fish-auth', () => ({ DivingFishAuthProvider: class {
  loginWithPassword = (...args: Parameters<typeof mockLogin>) => mockLogin(...args);
  useImportToken = () => session;
} }));
jest.mock('@rranker/sdk/services/invalidate-account-data', () => ({ cancelBoundAccountQueries: jest.fn(async () => undefined) }));

beforeEach(() => {
  jest.clearAllMocks(); useAccountStore.setState(initial, true);
  mockLifecycle = { appState: 'active', phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 1, memoryWarningGeneration: 0 };
  mockSave.mockResolvedValue('credential'); mockPlayer.mockResolvedValue(player); mockLogin.mockResolvedValue(session);
});

afterEach(() => useAccountStore.setState(initial, true));

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
    expect(mockSave).not.toHaveBeenCalled(); expect(useAccountStore.getState().boundAccounts).toEqual([]); expect(success).not.toHaveBeenCalled();
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
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(useAccountStore.getState().boundAccounts).toEqual([expect.objectContaining({ id: 'maimai:diving-fish:player', displayName: '玩家', credentialId: 'credential' })]);
    expect(useAccountStore.getState().credentialsById.credential).toEqual(session);
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
    expect(useAccountStore.getState().boundAccounts).toEqual([]); expect(success).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accountProbeCommand, runAccountRecoveryProbe } from './native/account-recovery-probe';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), bind: vi.fn(), restore: vi.fn(), getState: vi.fn(), loadVault: vi.fn(), clearVault: vi.fn(),
  loadHub: vi.fn(), loadHubAll: vi.fn(), upsertHub: vi.fn(), clearHub: vi.fn(), fetchMe: vi.fn(), getPlayer: vi.fn(),
}));
vi.mock('expo/fetch', () => ({ fetch: mocks.fetch }));
vi.mock('@/services/lxns-account-binding', () => ({ bindLxnsAccount: mocks.bind }));
vi.mock('@/services/account-restoration', () => ({ restoreAppAccounts: mocks.restore }));
vi.mock('@/services/score-hub-client', () => ({ fetchMe: mocks.fetchMe }));
vi.mock('@/state/session-store', () => ({ useSession: { getState: mocks.getState } }));
vi.mock('@/storage/secure-session-store', () => ({ SecureSessionStore: class {
  loadVault = mocks.loadVault;
  clear = mocks.clearVault;
} }));
vi.mock('@/storage/score-hub-account-store', () => ({ scoreHubAccountStore: {
  load: mocks.loadHub, loadAll: mocks.loadHubAll, upsert: mocks.upsertHub, clear: mocks.clearHub,
} }));

const runId = 'a'.repeat(32);
const accountId = 'maimai:lxns:123456789012345';
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getState.mockReturnValue({ restoreStatus: 'ready', activeAccountId: accountId,
    boundAccounts: [{ id: accountId }], credentialIdsByAccountId: { [accountId]: `lxns:probe:${runId}` },
    sessionsByAccountId: { [accountId]: { mode: 'lxns-oauth' } }, scoreProvider: { getPlayer: mocks.getPlayer } });
  mocks.loadHub.mockResolvedValue({ friendCode: '123456789012345', token: 'restored-hub-token' });
  mocks.getPlayer.mockResolvedValue({ id: '123456789012345' });
  mocks.fetchMe.mockResolvedValue({ friendCode: '123456789012345', hasCabinetUserId: true });
  mocks.loadVault.mockResolvedValue({ accounts: [] });
  mocks.loadHubAll.mockResolvedValue({ accounts: {} });
});
describe('native recovery stage contract', () => {
  it('authenticates only after the shared restore entry and never retrieves credentials during recovery', async () => {
    await runAccountRecoveryProbe('recover', runId);
    expect(mocks.restore).toHaveBeenCalledOnce();
    expect(mocks.restore.mock.invocationCallOrder[0]).toBeLessThan(mocks.getPlayer.mock.invocationCallOrder[0]);
    expect(mocks.fetchMe).toHaveBeenCalledWith('restored-hub-token');
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.bind).not.toHaveBeenCalled();
    expect(mocks.upsertHub).not.toHaveBeenCalled();
    expect(mocks.clearVault).toHaveBeenCalledOnce();
    expect(mocks.clearHub).toHaveBeenCalledOnce();
  });
  it('fails before authentication when restoration fails', async () => {
    mocks.getState.mockReturnValue({ restoreStatus: 'error' });
    await expect(runAccountRecoveryProbe('recover', runId)).rejects.toThrow('invariant');
    expect(mocks.fetchMe).not.toHaveBeenCalled();
    expect(mocks.getPlayer).not.toHaveBeenCalled();
  });
  it('propagates rejected recovered credentials instead of reporting success', async () => {
    mocks.fetchMe.mockRejectedValue(new Error('authentication rejected'));
    await expect(runAccountRecoveryProbe('recover', runId)).rejects.toThrow('authentication rejected');
  });
  it.each([null, `rranker://account-recovery?stage=recover&run=${runId}`,
    `rranker-nativeprobe://account-recovery?stage=recover&run=${runId}&token=bad`])(
    'rejects commands that inject anything beyond stage and run identity', url => expect(() => accountProbeCommand(url)).toThrow(),
  );
});

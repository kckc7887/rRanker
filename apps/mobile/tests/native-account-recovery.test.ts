import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accountProbeCommand, accountProbeFailureCode, runAccountRecoveryProbe } from './native/account-recovery-probe';

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
const fixture = { runId, lxns: { mode: 'lxns-oauth', accessToken: 'seed-access-token',
  refreshToken: 'seed-refresh-token', expiresAt: 9_999_999_999_999, persistable: true }, hubToken: 'seed-hub-token' };
function prepareSeed() {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => fixture });
  mocks.bind.mockResolvedValue({ account: { id: accountId }, credentialId: `lxns:probe:${runId}` });
  mocks.loadVault.mockResolvedValueOnce({ accounts: [] }).mockResolvedValue({ accounts: [{ id: accountId }],
    activeAccountId: accountId, credentials: [{ id: `lxns:probe:${runId}`, session: fixture.lxns }] });
  mocks.loadHub.mockResolvedValue({ token: fixture.hubToken });
}
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
  it('seeds through public binding and storage before verifying the exact saved credentials', async () => {
    prepareSeed();
    const publish = vi.fn();
    await runAccountRecoveryProbe('seed', runId, publish);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.bind).toHaveBeenCalledWith({ gameId: 'maimai', session: fixture.lxns, credentialId: `lxns:probe:${runId}` });
    expect(mocks.upsertHub).toHaveBeenCalledWith({ friendCode: '123456789012345', token: fixture.hubToken, hasCabinetBound: true });
    expect(mocks.upsertHub.mock.invocationCallOrder[0]).toBeLessThan(mocks.loadHub.mock.invocationCallOrder[0]);
    expect(publish.mock.calls.flat()).toEqual(['initial-main-store', 'initial-scorehub-store', 'fixture-fetch',
      'fixture-parse', 'lxns-bind', 'scorehub-write', 'main-readback', 'scorehub-readback']);
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(mocks.fetchMe).not.toHaveBeenCalled();
  });

  it.each([
    ['initial-main-store', () => mocks.loadVault.mockReset().mockRejectedValue(new Error('private storage detail'))],
    ['initial-scorehub-store', () => mocks.loadHubAll.mockRejectedValue(new Error('private storage detail'))],
    ['fixture-fetch', () => mocks.fetch.mockRejectedValue(new TypeError('private network detail'))],
    ['fixture-parse', () => mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ token: 'private token' }) })],
    ['lxns-bind', () => mocks.bind.mockRejectedValue({ code: 'network', message: 'private binding detail' })],
    ['scorehub-write', () => mocks.upsertHub.mockRejectedValue({ code: 'credential_storage', message: 'private token' })],
    ['main-readback', () => mocks.loadVault.mockReset().mockResolvedValueOnce({ accounts: [] }).mockRejectedValue(new Error('private read detail'))],
    ['scorehub-readback', () => mocks.loadHub.mockResolvedValue({ token: 'wrong token' })],
  ] as const)('retains the failed seed step %s without reporting later steps', async (step, fail) => {
    prepareSeed();
    fail();
    const publish = vi.fn();
    await expect(runAccountRecoveryProbe('seed', runId, publish)).rejects.toBeDefined();
    expect(publish.mock.lastCall).toEqual([step]);
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(mocks.fetchMe).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: 'credential_storage', message: 'private token', cause: { token: 'private token' } }, 'credential_storage'],
    [{ code: 'local_commit', message: 'private account' }, 'local_commit'],
    [new TypeError('private URL'), 'type'],
    [{ name: 'ZodError', issues: ['private token'] }, 'upstream_schema'],
    [{ name: 'AbortError', message: 'private token' }, 'cancelled'],
    [{ code: 'private token', name: 'private token', message: 'private token' }, 'unknown'],
    [new Error('private token'), 'unknown'],
    ['private token', 'unknown'],
  ])('projects errors to a fixed category only', (error, expected) => {
    expect(accountProbeFailureCode(error)).toBe(expected);
  });

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
    const publish = vi.fn();
    await expect(runAccountRecoveryProbe('recover', runId, publish)).rejects.toThrow('invariant');
    expect(publish.mock.lastCall).toEqual(['restore-check']);
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

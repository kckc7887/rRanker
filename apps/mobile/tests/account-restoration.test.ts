import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadOptionalBoundAccounts, restoreAppAccounts, getAccountSourceStatuses, retryFailedAccountSources } from '@/services/account-restoration';
import { LocalAccountStore } from '@/storage/local-account-store';
import { DemoAccountStore } from '@/storage/demo-account-store';
import { ChunithmDemoAccountStore } from '@/storage/chunithm-demo-account-store';
import { PhigrosDemoAccountStore } from '@/storage/phigros-demo-account-store';
import { MuseDashDemoAccountStore } from '@/storage/musedash-demo-account-store';
import { ChunithmTempAccountStore } from '@/storage/chunithm-temp-account-store';
import { TufAccountStore } from '@/storage/tuf-account-store';
import { MuseDashAccountStore } from '@/storage/musedash-account-store';
import { PhiraAccountStore } from '@/storage/phira-account-store';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { useSession } from '@/state/session-store';
import { useDebugStore } from '@/state/debug-store';
import { SessionPersistenceError } from '@/domain/session-vault';
import { snapshotEmergencyRuntimeDiagnostics } from '@/services/runtime-diagnostics-recorder';
import { CHUNITHM_TEST_ACCOUNT_ID, LOCAL_MAIMAI_ACCOUNT_ID, MAIMAI_TEST_ACCOUNT_ID, MUSEDASH_TEST_ACCOUNT_ID, PHIGROS_TEST_ACCOUNT_ID } from '@/domain/bound-account';

vi.mock('expo-sqlite', () => ({ openDatabaseAsync: vi.fn() }));

describe('startup account restoration', () => {
  beforeEach(() => {
    vi.spyOn(LocalAccountStore.prototype, 'load').mockResolvedValue([]);
    vi.spyOn(LocalAccountStore.prototype, 'upsert').mockResolvedValue([]);
    vi.spyOn(DemoAccountStore.prototype, 'load').mockResolvedValue([]);
    vi.spyOn(ChunithmDemoAccountStore.prototype, 'load').mockResolvedValue(null);
    vi.spyOn(PhigrosDemoAccountStore.prototype, 'load').mockResolvedValue(null);
    vi.spyOn(MuseDashDemoAccountStore.prototype, 'load').mockResolvedValue(null);
    vi.spyOn(ChunithmTempAccountStore.prototype, 'load').mockResolvedValue(false);
    vi.spyOn(TufAccountStore.prototype, 'load').mockResolvedValue([]);
    vi.spyOn(MuseDashAccountStore.prototype, 'load').mockResolvedValue([]);
    vi.spyOn(PhiraAccountStore.prototype, 'load').mockResolvedValue([]);
    vi.spyOn(SecureSessionStore.prototype, 'loadVault').mockResolvedValue({ version: 3, activeAccountId: null, credentials: [], accounts: [] });
    useDebugStore.setState({ testAccountsEnabled: false, hydrated: true });
    useSession.getState().finishRestore(null, []);
  });
  afterEach(() => vi.restoreAllMocks());



  it('keeps other account sources when one directory cannot be read', async () => {
    vi.mocked(TufAccountStore.prototype.load).mockRejectedValue(new Error('tuf io'));
    vi.mocked(LocalAccountStore.prototype.load).mockResolvedValue([{ id: LOCAL_MAIMAI_ACCOUNT_ID, displayName: '本地' }]);
    const accounts = await loadOptionalBoundAccounts();
    expect(accounts.map((account) => account.id)).toEqual([LOCAL_MAIMAI_ACCOUNT_ID]);
    expect(LocalAccountStore.prototype.upsert).not.toHaveBeenCalled();
  });
  it('preserves previously restored accounts on source failures and retries only failed sources', async () => {
    vi.mocked(TufAccountStore.prototype.load).mockResolvedValue([{ playerId: 1, displayName: 'TUF' }]);
    await restoreAppAccounts();
    const account = useSession.getState().boundAccounts[0]!;
    vi.mocked(TufAccountStore.prototype.load).mockRejectedValue(new Error('locked'));
    await restoreAppAccounts();
    expect(useSession.getState().boundAccounts).toContain(account);
    expect(getAccountSourceStatuses()).toContainEqual({ source: 'tuf', status: 'failed', errorCode: 'storage_unavailable' });
    vi.mocked(LocalAccountStore.prototype.load).mockClear();
    vi.mocked(TufAccountStore.prototype.load).mockResolvedValue([{ playerId: 1, displayName: 'recovered' }]);
    await retryFailedAccountSources();
    expect(LocalAccountStore.prototype.load).not.toHaveBeenCalled();
    expect(useSession.getState().boundAccounts[0]?.displayName).toBe('recovered');
    expect(getAccountSourceStatuses().find((source) => source.source === 'tuf')?.status).toBe('ready');
  });

  it('does not let a late retry resurrect removed accounts or overwrite newer bindings', async () => {
    vi.mocked(TufAccountStore.prototype.load).mockResolvedValue([{ playerId: 1, displayName: 'removed' }, { playerId: 2, displayName: 'original' }]);
    await restoreAppAccounts();
    vi.mocked(TufAccountStore.prototype.load).mockRejectedValue(new Error('locked'));
    await restoreAppAccounts();
    let release!: (accounts: Awaited<ReturnType<typeof TufAccountStore.prototype.load>>) => void;
    vi.mocked(TufAccountStore.prototype.load).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const retrying = retryFailedAccountSources();
    const original = useSession.getState().boundAccounts.find((account) => account.providerId === 'tuf' && account.displayName === 'original')!;
    const changed = { ...original, displayName: 'changed while reading' };
    const added = { ...original, id: 'adofai:tuf:3', displayName: 'new binding' };
    useSession.setState({ boundAccounts: [changed, added] });
    release([{ playerId: 1, displayName: 'old removed' }, { playerId: 2, displayName: 'old original' }, { playerId: 3, displayName: 'old new' }]);
    await retrying;
    expect(useSession.getState().boundAccounts).toEqual([changed, added]);
  });



  it('does not rebuild the default local account when its directory cannot be read', async () => {
    vi.mocked(LocalAccountStore.prototype.load).mockRejectedValue(new Error('local io'));
    await expect(loadOptionalBoundAccounts()).resolves.toEqual([]);
    expect(LocalAccountStore.prototype.upsert).not.toHaveBeenCalled();
  });

  it('does not invent a deleted local or demo account on an empty installation', async () => {
    await expect(loadOptionalBoundAccounts()).resolves.toEqual([]);
    expect(LocalAccountStore.prototype.upsert).not.toHaveBeenCalled();
  });

  it('restores all four saved demo games and the selected demo while the debug switch is off', async () => {
    vi.mocked(DemoAccountStore.prototype.load).mockResolvedValue([{ id: MAIMAI_TEST_ACCOUNT_ID, displayName: '舞萌示例' }]);
    vi.mocked(ChunithmDemoAccountStore.prototype.load).mockResolvedValue({ id: CHUNITHM_TEST_ACCOUNT_ID, displayName: '中二示例' });
    vi.mocked(PhigrosDemoAccountStore.prototype.load).mockResolvedValue({ id: PHIGROS_TEST_ACCOUNT_ID, displayName: 'Phigros 示例' });
    vi.mocked(MuseDashDemoAccountStore.prototype.load).mockResolvedValue({ id: MUSEDASH_TEST_ACCOUNT_ID, displayName: '喵斯示例' });
    vi.mocked(SecureSessionStore.prototype.loadVault).mockResolvedValue({ version: 3, activeAccountId: PHIGROS_TEST_ACCOUNT_ID, credentials: [], accounts: [] });
    await restoreAppAccounts();
    expect(useDebugStore.getState().testAccountsEnabled).toBe(false);
    const state = useSession.getState();
    expect(state.restoreStatus).toBe('ready');
    expect(state.boundAccounts.map((account) => account.id)).toEqual([MAIMAI_TEST_ACCOUNT_ID, CHUNITHM_TEST_ACCOUNT_ID, PHIGROS_TEST_ACCOUNT_ID, MUSEDASH_TEST_ACCOUNT_ID]);
    expect(state.activeAccountId).toBe(PHIGROS_TEST_ACCOUNT_ID);
  });

  it('keeps public accounts in the established restoration order and removes the temporary account only when a formal one exists', async () => {
    vi.mocked(ChunithmTempAccountStore.prototype.load).mockResolvedValue(true);
    vi.mocked(TufAccountStore.prototype.load).mockResolvedValue([{ playerId: 1, displayName: 'TUF' }]);
    vi.mocked(MuseDashAccountStore.prototype.load).mockResolvedValue([{ userId: '0123456789abcdef0123456789abcdef', displayName: 'Muse Dash' }]);
    vi.mocked(PhiraAccountStore.prototype.load).mockResolvedValue([{ playerId: 2, displayName: 'Phira' }]);
    await restoreAppAccounts();
    expect(useSession.getState().boundAccounts.map((account) => account.gameId)).toEqual(['chunithm', 'adofai', 'musedash', 'phira']);
    vi.mocked(SecureSessionStore.prototype.loadVault).mockResolvedValue({
      version: 3, activeAccountId: 'chunithm:lxns:1',
      credentials: [{ id: 'shared', providerId: 'lxns', session: { mode: 'lxns-oauth', accessToken: 'test', refreshToken: 'test', expiresAt: Date.now() + 600_000, persistable: true } }],
      accounts: [{ id: 'chunithm:lxns:1', gameId: 'chunithm', providerId: 'lxns', credentialId: 'shared', displayName: '中二', scoreDisplay: '17' }],
    });
    await restoreAppAccounts();
    expect(useSession.getState().boundAccounts.map((account) => account.providerId)).not.toContain('chunithm-temp');
  });

  it('exposes a failed vault restore as an empty recoverable session', async () => {
    const initialDiagnostics = snapshotEmergencyRuntimeDiagnostics().length;
    vi.mocked(SecureSessionStore.prototype.loadVault).mockRejectedValue(new SessionPersistenceError('credential_storage'));
    await restoreAppAccounts();
    expect(useSession.getState()).toMatchObject({ restoreStatus: 'error', boundAccounts: [], session: null });
    expect(snapshotEmergencyRuntimeDiagnostics().slice(initialDiagnostics)).toContainEqual(expect.objectContaining({
      type: 'error', fields: expect.objectContaining({
        source: 'account-restoration', phase: 'vault', errorCode: 'credential_storage',
      }),
    }));
  });
});

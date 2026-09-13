import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadOptionalBoundAccounts, restoreAppAccounts } from '@/services/account-restoration';
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
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { useSession } from '@/state/session-store';
import { useDebugStore } from '@/state/debug-store';
import type { ScoreSnapshot } from '@/domain/models';
import { CHUNITHM_TEST_ACCOUNT_ID, LOCAL_MAIMAI_ACCOUNT_ID, MAIMAI_TEST_ACCOUNT_ID, MUSEDASH_TEST_ACCOUNT_ID, PHIGROS_TEST_ACCOUNT_ID } from '@/domain/bound-account';

vi.mock('expo-sqlite', () => ({ openDatabaseAsync: vi.fn() }));

describe('startup account restoration', () => {
  beforeEach(() => {
    vi.spyOn(LocalAccountStore.prototype, 'load').mockResolvedValue([]);
    vi.spyOn(LocalAccountStore.prototype, 'upsert').mockResolvedValue(undefined);
    vi.spyOn(DemoAccountStore.prototype, 'load').mockResolvedValue([]);
    vi.spyOn(ChunithmDemoAccountStore.prototype, 'load').mockResolvedValue(null);
    vi.spyOn(PhigrosDemoAccountStore.prototype, 'load').mockResolvedValue(null);
    vi.spyOn(MuseDashDemoAccountStore.prototype, 'load').mockResolvedValue(null);
    vi.spyOn(ChunithmTempAccountStore.prototype, 'load').mockResolvedValue(false);
    vi.spyOn(TufAccountStore.prototype, 'load').mockResolvedValue([]);
    vi.spyOn(MuseDashAccountStore.prototype, 'load').mockResolvedValue([]);
    vi.spyOn(PhiraAccountStore.prototype, 'load').mockResolvedValue([]);
    vi.spyOn(SqliteSnapshotRepository.prototype, 'getLatest').mockResolvedValue(null);
    vi.spyOn(SecureSessionStore.prototype, 'loadVault').mockResolvedValue({ version: 3, activeAccountId: null, credentials: [], accounts: [] });
    useDebugStore.setState({ testAccountsEnabled: false, hydrated: true });
    useSession.getState().finishRestore(null, []);
  });
  afterEach(() => vi.restoreAllMocks());

  it('migrates an existing local score snapshot once while deferring rating hydration', async () => {
    vi.mocked(SqliteSnapshotRepository.prototype.getLatest).mockResolvedValue({ player: { displayName: '  旧玩家  ', rating: 15000 } } as ScoreSnapshot);
    const first = await loadOptionalBoundAccounts();
    expect(LocalAccountStore.prototype.upsert).toHaveBeenCalledWith({ id: LOCAL_MAIMAI_ACCOUNT_ID, displayName: '旧玩家' });
    expect(first).toMatchObject([{ id: LOCAL_MAIMAI_ACCOUNT_ID, displayName: '旧玩家', scoreDisplay: '00000' }]);
    vi.mocked(LocalAccountStore.prototype.load).mockResolvedValue([{ id: LOCAL_MAIMAI_ACCOUNT_ID, displayName: '旧玩家' }]);
    await loadOptionalBoundAccounts();
    expect(SqliteSnapshotRepository.prototype.getLatest).toHaveBeenCalledOnce();
    expect(LocalAccountStore.prototype.upsert).toHaveBeenCalledOnce();
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
    vi.mocked(SecureSessionStore.prototype.loadVault).mockRejectedValue(new Error('vault unavailable'));
    await restoreAppAccounts();
    expect(useSession.getState()).toMatchObject({ restoreStatus: 'error', boundAccounts: [], session: null });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChunithmBoundAccount } from '@rranker/game-chunithm/accounts';
import { createMaimaiBoundAccount } from '@rranker/game-maimai/accounts';
import { createPhigrosBoundAccount } from '@rranker/game-phigros/accounts';
import { createTufBoundAccount } from '@rranker/game-adofai/accounts';
import type { Credential } from '@rranker/sdk/credentials';
import type { GameDataBundle } from '@rranker/sdk/data';
import { hydrateAccountSummary, hydrateAccountSummaries } from '@rranker/sdk/services/account-hydration';
import { persistBoundAccountAvatar } from '@rranker/sdk/services/resolve-account-avatar-persist';
import { accountThumbnailResourceKey } from '@rranker/sdk/domain/account-thumbnail';
import { useAccountStore } from '@rranker/sdk/state/account-store';
import { useSession } from '@rranker/sdk/state/session-store';
import { queryClient } from '@rranker/sdk/state/query-client';
import { gameDataQueryKey } from '@rranker/sdk/services/game-data-query';
import { getGameProfile } from '@rranker/sdk/domain/game-profile';
import { invalidateResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';
import { applyDisabledPlugins } from '@rranker/sdk/services/plugin-lifecycle';
import { setDisabledPlugins } from '@rranker/sdk/registry';
import { SecureSessionStore } from '@rranker/sdk/storage/secure-session-store';
import { PhigrosScoreProvider } from '@rranker/provider-phi-taptap/providers/phigros-score-provider';
import { tufProvider } from '@rranker/provider-tuf/providers/tuf-provider';
import { phigrosPayloadFromSnapshot } from '@rranker/game-phigros/domain/game-data';

const storage = vi.hoisted(() => ({ values: new Map<string, unknown>(), getResource: vi.fn(), getLatest: vi.fn(), saveResource: vi.fn() }));
const avatars = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('@rranker/game-phigros/services/phigros-avatar-resolver', () => ({ resolvePhigrosAvatarUrl: avatars.resolve }));
vi.mock('@rranker/sdk/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {
  getResource = storage.getResource; saveResource = storage.saveResource; deleteResource = vi.fn();
} }));
vi.mock('@rranker/game-maimai/storage/score-repository', () => ({ ScoreRepository: class { getLatest = storage.getLatest; } }));

const initial = useAccountStore.getState();
const lxns = createMaimaiBoundAccount({ providerId: 'lxns', displayName: '落雪玩家', rating: 15000, playerId: '123456789' });
const tuf = createTufBoundAccount({ playerId: 25, displayName: 'TUF 玩家' });
const lxnsCredential: Credential = { mode: 'lxns-oauth', accessToken: 'access-token', refreshToken: 'refresh-token', expiresAt: Date.now() + 120_000, persistable: true };
const phiCredential: Credential = { mode: 'phi-session', sessionToken: 'token', openid: 'player', displayName: 'player', persistable: true };
const tufPlayer = { id: 25, name: 'TUF 玩家', rankedScore: 1, generalScore: 0, ppScore: 0,
  totalPasses: 0, universalPassCount: 0, worldFirstCount: 0, topScores: [], globalRank: null };
function bindPhi() {
  const account = createPhigrosBoundAccount({ openid: 'player', displayName: 'player', rating: 15 });
  useAccountStore.getState().bindAccounts({ accounts: [account], session: phiCredential, credentialId: 'phi', activeAccountId: account.id });
  return account;
}
function payload(rating: number) {
  const source = { kind: 'generated', label: 'TapTap云存档', updatedAt: '2026-10-14T01:00:00.000Z', isStale: false };
  return phigrosPayloadFromSnapshot({ player: { id: 'player', displayName: '云存档玩家', rating, source }, records: [], bestSections: [],
    challengeModeRank: 301, source, progress: { cleared: [1, 2, 3, 4], fullCombo: [0, 1, 2, 3], phi: [0, 0, 1, 2] } },
  source, { avatarUrl: 'https://example.test/current.png' });
}
function publishPhi(id: string, rating: number) {
  queryClient.setQueryData<GameDataBundle>(gameDataQueryKey(id, 'phigros', 'phi-taptap', 'phi-session'), {
    gameId: 'phigros', providerId: 'phi-taptap', profile: getGameProfile('phigros'), payload: payload(rating),
  });
}
const current = (id: string) => useAccountStore.getState().boundAccounts.find(account => account.id === id);

beforeEach(() => {
  setDisabledPlugins([]); vi.restoreAllMocks(); vi.clearAllMocks(); storage.values.clear(); queryClient.clear();
  useAccountStore.setState(initial, true);
  storage.getLatest.mockReset().mockResolvedValue(null);
  storage.getResource.mockReset().mockImplementation(async (key: string) => storage.values.get(key) ?? null);
  storage.saveResource.mockReset().mockImplementation(async (key: string, _version: number, _time: string, value: unknown, assertCurrent?: () => void) => {
    assertCurrent?.(); storage.values.set(key, value);
  });
  vi.spyOn(SecureSessionStore.prototype, 'updateAccountMetadata').mockResolvedValue(undefined);
  avatars.resolve.mockResolvedValue('https://example.test/phi.png');
  useAccountStore.getState().bindAccounts({ accounts: [lxns], session: lxnsCredential, credentialId: 'lxns', activeAccountId: lxns.id });
  useAccountStore.getState().upsertBoundAccount(tuf);
});
afterEach(() => { setDisabledPlugins([]); vi.unstubAllGlobals(); useAccountStore.setState(initial, true); });

describe('账号资料补全', () => {
  it('从 LXNS 快照补全头像并持久化到统一摘要', async () => {
    storage.getLatest.mockResolvedValue({ player: { presentation: { iconId: 255406 } } });
    await hydrateAccountSummary(lxns.id);
    const avatarUrl = 'https://assets2.lxns.net/maimai/icon/255406.png';
    expect(current(lxns.id)?.avatarUrl).toBe(avatarUrl);
    expect(storage.values.get(accountThumbnailResourceKey(lxns.id))).toMatchObject({ scoreDisplay: '15000', avatarUrl });
  });

  it('复用已持久化的公开玩家头像', async () => {
    storage.values.set(accountThumbnailResourceKey(tuf.id), { avatarUrl: 'https://example.test/stored.png' });
    vi.spyOn(tufProvider, 'getPlayerProfile').mockRejectedValue(new Error('offline'));
    await hydrateAccountSummary(tuf.id);
    expect(current(tuf.id)?.avatarUrl).toBe('https://example.test/stored.png');
  });

  it('中二缓存资料在没有活动凭据时仍可补全', async () => {
    const account = createChunithmBoundAccount({ displayName: '中二玩家', rating: 16, playerId: '1' });
    useAccountStore.getState().upsertBoundAccount(account);
    storage.getResource.mockImplementation(async (key: string) => key.startsWith('chunithm-score:')
      ? { player: { name: '缓存玩家', rating: 16.5, rating_possession: 'rainbow', map_icon: { id: 1001001 } } }
      : storage.values.get(key) ?? null);
    await hydrateAccountSummary(account.id);
    expect(current(account.id)).toMatchObject({ displayName: '缓存玩家', scoreDisplay: '16.50', displayData: { ratingPossession: 'rainbow' },
      avatarUrl: 'https://assets2.lxns.net/chunithm/icon/1001001.png' });
  });

  it('读取 Phigros 磁盘快照期间发布的新查询优先显示', async () => {
    const account = bindPhi(); const started = Promise.withResolvers<void>(); const disk = Promise.withResolvers<ReturnType<typeof payload>>();
    storage.getResource.mockImplementation(async (key: string) => {
      if (key.startsWith('phigros-save:')) { started.resolve(); return disk.promise; }
      return storage.values.get(key) ?? null;
    });
    const pending = hydrateAccountSummary(account.id);
    await started.promise; publishPhi(account.id, 16); disk.resolve(payload(14)); await pending;
    expect(current(account.id)).toMatchObject({ scoreDisplay: '16.0000', displayName: '云存档玩家', displayData: { challengeModeRank: 301 } });
    expect(storage.values.get(accountThumbnailResourceKey(account.id))).toMatchObject({ scoreDisplay: '16.0000', displayData: { challengeModeRank: 301 } });
  });

  it('账号读取失败保留已显示和持久化的资料', async () => {
    const account = bindPhi(); storage.values.set(accountThumbnailResourceKey(account.id), { scoreDisplay: '15.0000' });
    storage.getResource.mockRejectedValue(new Error('storage unavailable'));
    await expect(hydrateAccountSummary(account.id)).rejects.toThrow('storage unavailable');
    expect(current(account.id)?.scoreDisplay).toBe(account.scoreDisplay);
    expect(storage.values.get(accountThumbnailResourceKey(account.id))).toEqual({ scoreDisplay: '15.0000' });
  });

  it('一个消费者取消后另一个仍能取得并保存资料', async () => {
    const started = Promise.withResolvers<void>(); const response = Promise.withResolvers<typeof tufPlayer & { avatarUrl: string }>();
    vi.spyOn(tufProvider, 'getPlayerProfile').mockImplementation(async () => { started.resolve(); return response.promise; });
    const controller = new AbortController();
    const cancelled = hydrateAccountSummary(tuf.id, controller.signal);
    const rejected = expect(cancelled).rejects.toThrow();
    const remaining = hydrateAccountSummary(tuf.id, new AbortController().signal);
    await started.promise; controller.abort(); response.resolve({ ...tufPlayer, avatarUrl: 'https://example.test/shared.png' });
    await rejected; await remaining;
    expect(current(tuf.id)?.avatarUrl).toBe('https://example.test/shared.png');
  });

  it.each(['清理游戏', '重新绑定', '停用来源'] as const)('%s 后拒绝迟到的资料', async action => {
    const started = Promise.withResolvers<void>(); const response = Promise.withResolvers<typeof tufPlayer & { avatarUrl: string }>();
    vi.spyOn(tufProvider, 'getPlayerProfile').mockImplementation(async () => { started.resolve(); return response.promise; });
    const pending = hydrateAccountSummaries(new AbortController().signal, [tuf]);
    await started.promise;
    if (action === '清理游戏') invalidateResourceWrites('adofai');
    else if (action === '停用来源') setDisabledPlugins(['provider.tuf']);
    else { useAccountStore.getState().removeBoundAccount(tuf.id); useAccountStore.getState().upsertBoundAccount(tuf); }
    response.resolve({ ...tufPlayer, avatarUrl: 'https://example.test/late.png' }); await pending;
    expect(current(tuf.id)?.avatarUrl).toBe(tuf.avatarUrl);
    expect(storage.values.has(accountThumbnailResourceKey(tuf.id))).toBe(false);
  });

  it('凭据归属变更后拒绝之前读到的头像', async () => {
    const started = Promise.withResolvers<void>(); const disk = Promise.withResolvers<unknown>();
    storage.getLatest.mockImplementation(async () => { started.resolve(); return disk.promise; });
    const pending = hydrateAccountSummary(lxns.id); const rejected = expect(pending).rejects.toThrow();
    await started.promise;
    useAccountStore.getState().bindAccounts({ accounts: [lxns], session: lxnsCredential, credentialId: 'new-lxns', activeAccountId: lxns.id });
    disk.resolve({ player: { presentation: { iconId: 200201 } } }); await rejected;
    expect(storage.values.has(accountThumbnailResourceKey(lxns.id))).toBe(false);
  });

  it('正常令牌轮换和切换活动账号不阻止资料提交', async () => {
    useAccountStore.getState().updateCredential('lxns', { ...lxnsCredential, refreshToken: 'avatar-old', expiresAt: 0 });
    vi.spyOn(SecureSessionStore.prototype, 'updateCredentialSession').mockResolvedValue('applied');
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/oauth/token')) return new Response(JSON.stringify({ access_token: 'avatar-access', refresh_token: 'avatar-new', expires_in: 3600 }), { status: 200 });
      useAccountStore.getState().selectBoundAccount(tuf.id);
      return new Response(JSON.stringify({ success: true, code: 200, data: { name: '落雪玩家', rating: 15000,
        friend_code: 123456789, icon: { id: 200201, name: '头像' } } }), { status: 200 });
    }));
    await hydrateAccountSummary(lxns.id);
    expect(current(lxns.id)?.avatarUrl).toBe('https://assets2.lxns.net/maimai/icon/200201.png');
    expect(useAccountStore.getState().credentialsById.lxns).toMatchObject({ refreshToken: 'avatar-new' });
    expect(useSession.getState().activeAccountId).toBe(tuf.id);
  });

  it('停用来源立即取消共享的真实 HTTP 资料请求，重新启用后重新读取', async () => {
    const started = Promise.withResolvers<AbortSignal>();
    vi.stubGlobal('fetch', vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
      const signal = init!.signal!;
      started.resolve(signal);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })));
    const first = hydrateAccountSummary(lxns.id);
    const second = hydrateAccountSummary(lxns.id);
    const firstRejected = expect(first).rejects.toThrow();
    const secondRejected = expect(second).rejects.toThrow();
    const request = await started.promise;
    await applyDisabledPlugins(['provider.lxns']);
    expect(request.aborted).toBe(true);
    await firstRejected; await secondRejected;
    expect(storage.values.has(accountThumbnailResourceKey(lxns.id))).toBe(false);
    await applyDisabledPlugins([]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, code: 200,
      data: { name: '落雪玩家', rating: 15000, friend_code: 123456789, icon: { id: 200201, name: '头像' } } }), { status: 200 })));
    await hydrateAccountSummary(lxns.id);
    expect(current(lxns.id)?.avatarUrl).toBe('https://assets2.lxns.net/maimai/icon/200201.png');
  });

  it('补全不会复用已取消的 Phigros 请求', async () => {
    const account = bindPhi(); const controller = new AbortController();
    const summary = { saveVersion: 1, challengeModeRank: 201, rankingScore: 16, gameVersion: 301, avatar: 'avatar.Cipher1',
      cleared: [1, 2, 3, 4] as [number, number, number, number], fullCombo: [0, 1, 2, 3] as [number, number, number, number], phi: [0, 0, 1, 2] as [number, number, number, number] };
    vi.spyOn(PhigrosScoreProvider.prototype, 'getSummary').mockImplementationOnce(async () => { controller.abort(); return summary; }).mockResolvedValue(summary);
    await expect(hydrateAccountSummary(account.id, controller.signal)).rejects.toThrow();
    await hydrateAccountSummary(account.id);
    expect(current(account.id)).toMatchObject({ scoreDisplay: '16.0000', avatarUrl: 'https://example.test/phi.png', displayData: { challengeModeRank: 201 } });
  });

  it('队列中的头像提交再次检查账号资格', async () => {
    const started = Promise.withResolvers<void>(); const save = Promise.withResolvers<void>();
    storage.saveResource.mockImplementation(async (_key, _version, _time, _value, assertCurrent: () => void) => {
      started.resolve(); await save.promise; assertCurrent();
    });
    const pending = persistBoundAccountAvatar(lxns.id, 'https://example.test/queued.png'); const rejected = expect(pending).rejects.toThrow();
    await started.promise; useAccountStore.getState().removeBoundAccount(lxns.id); save.resolve(); await rejected;
  });
});

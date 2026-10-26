import { afterEach, expect, it, vi } from 'vitest';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';

const state = vi.hoisted(() => ({ release: { revision: 'r1', difficulty: 'Song.A\t10\t0\t0\t0' } }));
const download = vi.hoisted(() => vi.fn(async () => new ArrayBuffer(0)));
const summaryBase64 = vi.hoisted(() => {
  const bytes = Buffer.alloc(33);
  bytes.writeUInt8(1, 0); bytes.writeFloatLE(15, 3); bytes.writeUInt8(100, 7);
  return bytes.toString('base64');
});
const metadata = vi.hoisted(() => vi.fn(async () => ({ saveUrl: 'https://example.com/save', updatedAt: 'today', summaryBase64 })));
const playerName = vi.hoisted(() => vi.fn(async () => 'Player'));
vi.mock('@/services/phigros-resources', () => ({ phigrosResources: {
  load: async () => state.release, peek: () => state.release,
} }));
vi.mock('@/providers/phigros-auth', () => ({
  getGameSave: metadata,
  getPlayerName: playerName,
  downloadSave: download,
}));
vi.mock('@/domain/phigros', async (original) => ({
  ...await original<typeof import('@/domain/phigros')>(),
  decodeSaveZip: async () => ({ gameRecord: { 'Song.A': [{
    songId: 'Song.A', level: 'EZ', difficulty: 0, score: 1_000_000,
    rawAcc: 100, acc: 100, fc: true, rks: 0,
  }] }, user: null, gameProgress: null }),
}));
afterEach(() => {
  download.mockClear();
  metadata.mockReset().mockResolvedValue({ saveUrl: 'https://example.com/save', updatedAt: 'today', summaryBase64 });
  playerName.mockReset().mockResolvedValue('Player');
  state.release = { revision: 'r1', difficulty: 'Song.A\t10\t0\t0\t0' };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

it('同次刷新共用存档元信息，失败后可以重新读取', async () => {
  const provider = new PhigrosScoreProvider({ mode: 'phi-session', sessionToken: 'token', openid: 'player', displayName: 'player', persistable: true });
  const pending = deferred<Awaited<ReturnType<typeof metadata>>>();
  metadata.mockReturnValueOnce(pending.promise);
  const player = provider.getPlayer();
  const summary = provider.getSummary();
  const records = provider.getRecords();
  expect(metadata).toHaveBeenCalledTimes(1);
  pending.resolve({ saveUrl: 'https://example.com/save', updatedAt: 'shared', summaryBase64 });
  expect((await player).source.updatedAt).toBe('shared');
  expect((await summary).rankingScore).toBe(15);
  expect(await records).toHaveLength(1);
  provider.invalidateCache();
  metadata.mockRejectedValueOnce(new Error('offline'));
  await expect(provider.getSummary()).rejects.toThrow('offline');
  await expect(provider.getSummary()).resolves.toMatchObject({ rankingScore: 15 });
});

it('元信息旧请求不会覆盖刷新后的数据', async () => {
  const provider = new PhigrosScoreProvider({ mode: 'phi-session', sessionToken: 'token', openid: 'player', displayName: 'player', persistable: true });
  const pending = deferred<Awaited<ReturnType<typeof metadata>>>();
  metadata.mockReturnValueOnce(pending.promise);
  const previous = provider.getSummary();
  const rejected = expect(previous).rejects.toThrow('replaced');
  provider.invalidateCache();
  await provider.getSummary();
  pending.resolve({ saveUrl: 'https://example.com/old', updatedAt: 'old', summaryBase64 });
  await rejected;
  expect(provider.getSaveUpdatedAt()).toBe('today');
});

it('存档摘要解析失败后可以重取元信息并恢复玩家数据', async () => {
  const provider = new PhigrosScoreProvider({ mode: 'phi-session', sessionToken: 'token', openid: 'player', displayName: 'player', persistable: true });
  metadata.mockResolvedValueOnce({ saveUrl: 'https://example.com/save', updatedAt: 'broken', summaryBase64: '' });
  await expect(provider.getPlayer()).rejects.toThrow();
  expect(provider.getSaveUpdatedAt()).toBeNull();
  await expect(provider.getPlayer()).resolves.toMatchObject({ rating: 15, source: { updatedAt: 'today' } });
  await expect(provider.getSummary()).resolves.toMatchObject({ rankingScore: 15, gameVersion: 100 });
});

it('刷新会重新读取昵称，首次失败的回退名称不进入缓存', async () => {
  const provider = new PhigrosScoreProvider({ mode: 'phi-session', sessionToken: 'token', openid: 'player', displayName: 'player', persistable: true });
  playerName.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('First');
  expect((await provider.getPlayer()).displayName).toBe('player');
  expect((await provider.getPlayer()).displayName).toBe('First');
  provider.invalidateCache();
  playerName.mockResolvedValueOnce('Renamed');
  expect((await provider.getPlayer()).displayName).toBe('Renamed');
});

it('刷新前的慢昵称响应不会覆盖新昵称', async () => {
  const provider = new PhigrosScoreProvider({ mode: 'phi-session', sessionToken: 'token', openid: 'player', displayName: 'player', persistable: true });
  const pending = deferred<string>();
  playerName.mockReturnValueOnce(pending.promise);
  const previous = provider.getPlayer();
  const rejected = expect(previous).rejects.toThrow('replaced');
  provider.invalidateCache();
  playerName.mockResolvedValueOnce('New');
  expect((await provider.getPlayer()).displayName).toBe('New');
  pending.resolve('Old');
  await rejected;
  expect((await provider.getPlayer()).displayName).toBe('New');
});

it('recalculates cached records and Best30 against a new resource revision without downloading the save again', async () => {
  const provider = new PhigrosScoreProvider({ mode: 'phi-session', sessionToken: 'token', openid: 'player', displayName: 'player', persistable: true });
  const before = await provider.getB30();
  expect(before.best27[0]?.difficulty).toBe(10);
  state.release = { revision: 'r2', difficulty: 'Song.A\t12\t0\t0\t0' };
  const after = await provider.getB30();
  expect(after.best27[0]?.difficulty).toBe(12);
  expect(after.best27[0]?.rks).toBe(12);
  expect(after.rks).toBeGreaterThan(before.rks);
  expect(download).toHaveBeenCalledTimes(1);
});

it('passes the abort signal into the push search', async () => {
  const provider = new PhigrosScoreProvider({ mode: 'phi-session', sessionToken: 'token', openid: 'player', displayName: 'player', persistable: true });
  await provider.getB30();
  let reads = 0;
  const flipping = {
    get aborted() { reads += 1; return reads > 2; },
    reason: new Error('stop-search'),
  };
  await expect(provider.getPushRecommendations(0.5, 2, true, flipping as AbortSignal)).rejects.toThrow('stop-search');
});

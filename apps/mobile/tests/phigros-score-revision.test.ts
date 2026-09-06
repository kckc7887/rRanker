import { afterEach, expect, it, vi } from 'vitest';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';

const state = vi.hoisted(() => ({ release: { revision: 'r1', difficulty: 'Song.A\t10\t0\t0\t0' } }));
const download = vi.hoisted(() => vi.fn(async () => new ArrayBuffer(0)));
vi.mock('@/services/phigros-resources', () => ({ phigrosResources: {
  load: async () => state.release, peek: () => state.release,
} }));
vi.mock('@/providers/phigros-auth', () => ({
  getGameSave: async () => ({ saveUrl: 'https://example.com/save', updatedAt: 'today', summaryBase64: '' }),
  downloadSave: download,
}));
vi.mock('@/domain/phigros', async (original) => ({
  ...await original<typeof import('@/domain/phigros')>(),
  parseSummary: () => ({ gameVersion: 100 }),
  decodeSaveZip: async () => ({ gameRecord: { 'Song.A': [{
    songId: 'Song.A', level: 'EZ', difficulty: 0, score: 1_000_000,
    rawAcc: 100, acc: 100, fc: true, rks: 0,
  }] }, user: null, gameProgress: null }),
}));
afterEach(() => { download.mockClear(); state.release = { revision: 'r1', difficulty: 'Song.A\t10\t0\t0\t0' }; });

it('recalculates cached records and Best30 against a new resource revision without downloading the save again', async () => {
  const provider = new PhigrosScoreProvider({ mode: 'phi-session', sessionToken: 'token', playerId: 'player', persistable: true });
  const before = await provider.getB30();
  expect(before.best27[0]?.difficulty).toBe(10);
  state.release = { revision: 'r2', difficulty: 'Song.A\t12\t0\t0\t0' };
  const after = await provider.getB30();
  expect(after.best27[0]?.difficulty).toBe(12);
  expect(after.best27[0]?.rks).toBe(12);
  expect(after.rks).toBeGreaterThan(before.rks);
  expect(download).toHaveBeenCalledTimes(1);
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { applyRizlineCatalog, ensureRizlineCatalog, refreshRizlineCatalog } from '@/services/rizline-catalog-query';
import { rizlinePayloadFromSnapshot, type GameDataBundle } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import { gameDataQueryKey } from '@/services/game-data-query';
import { rizlineResources } from '@/services/rizline-resources';
import { queryClient } from '@/state/query-client';
import { rizlineCatalog, rizlineSave, rizlineSong, rizlineChart } from './fixtures/rizline';
import { buildMaxedRizlineSnapshot } from '@/providers/maxed-rizline-test-provider';
import type { RizlineCatalogData } from '@/domain/rizline';

vi.mock('@/components/CachedTabScreen', () => ({ useCachedTabActive: () => true }));
vi.mock('@/state/query-client', () => ({ queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }));
vi.mock('@/services/rizline-resources', () => ({ rizlineResources: { load: vi.fn(), loadFresh: vi.fn() } }));

const source = { kind: 'rizline' as const, label: 'Rizline 曲库', updatedAt: '2026-09-13', isStale: false };
const key = gameDataQueryKey('rizline:u1', 'rizline', 'rizline-official', 'rizline');
beforeEach(() => { queryClient.clear(); vi.clearAllMocks(); });
describe('Rizline catalog and account query coordination', () => {
  it('rebuilds example scores and total RKS when songs are added, revised or removed', async () => {
    const demoKey = gameDataQueryKey('rizline:test', 'rizline', 'rizline-test', 'rizline');
    const catalog = rizlineCatalog();
    queryClient.setQueryData<GameDataBundle>(demoKey, { gameId: 'rizline', providerId: 'rizline-test', profile: getGameProfile('rizline'),
      payload: rizlinePayloadFromSnapshot(buildMaxedRizlineSnapshot(catalog, '示例玩家'), { snapshot: catalog, source }) });
    const replacement = { ...catalog, resourceVersion: 'r2', songs: [rizlineSong({
      id: 'new-song', title: '新歌曲', charts: [rizlineChart({ id: 'new-chart', songId: 'new-song', constant: 15, maxScore: 1_003_000 })],
    })] };
    await applyRizlineCatalog(queryClient, { snapshot: replacement, source });
    const payload = queryClient.getQueryData<GameDataBundle>(demoKey)!.payload;
    if (payload.kind !== 'rizline') throw new Error('Wrong payload');
    expect(payload.player.username).toBe('示例玩家');
    expect(payload.records).toHaveLength(1);
    expect(payload.records[0]).toMatchObject({ songId: 'new-song', title: '新歌曲', score: 1_003_000, rks: 175.5, ap: true });
    expect(payload.player.totalRks).toBe(175.5 / 40);
  });
  it('updates derived best groups after background metadata arrives without changing official RKS', async () => {
    const snapshot = { save: rizlineSave(), source };
    queryClient.setQueryData<GameDataBundle>(key, { gameId: 'rizline', providerId: 'rizline-official', profile: getGameProfile('rizline'),
      payload: rizlinePayloadFromSnapshot(snapshot) });
    let onFresh!: (data: RizlineCatalogData) => void;
    vi.mocked(rizlineResources.load).mockImplementation(async (_signal, callback) => {
      onFresh = callback!;
      return { snapshot: { ...rizlineCatalog(), songs: [] }, source: { ...source, isStale: true } };
    });
    await ensureRizlineCatalog(queryClient);
    await onFresh({ snapshot: rizlineCatalog(), source });
    const payload = queryClient.getQueryData<GameDataBundle>(key)!.payload;
    if (payload.kind !== 'rizline') throw new Error('Wrong payload');
    expect(payload.best.ah5).toHaveLength(1);
    expect(payload.best.hasUnknownCandidates).toBe(false);
    expect(payload.player.totalRks).toBe(snapshot.save.totalRks);
    expect(payload.snapshot).toEqual(snapshot);
  });
  it('retains valid account data after a failed catalog update', async () => {
    const bundle: GameDataBundle = { gameId: 'rizline', providerId: 'rizline-official', profile: getGameProfile('rizline'),
      payload: rizlinePayloadFromSnapshot({ save: rizlineSave(), source }, { snapshot: rizlineCatalog(), source }) };
    queryClient.setQueryData(key, bundle);
    vi.mocked(rizlineResources.loadFresh).mockRejectedValue(new Error('corrupt release'));
    await expect(refreshRizlineCatalog(queryClient)).rejects.toThrow('corrupt release');
    expect(queryClient.getQueryData(key)).toEqual(bundle);
  });
});

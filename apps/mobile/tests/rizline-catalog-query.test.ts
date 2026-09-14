import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { ensureRizlineCatalog, refreshRizlineCatalog } from '@/hooks/use-rizline-catalog';
import { rizlinePayloadFromSnapshot, type GameDataBundle } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import { gameDataQueryKey } from '@/services/game-data-query';
import { rizlineResources } from '@/services/rizline-resources';
import { queryClient } from '@/state/query-client';
import { rizlineCatalog, rizlineSave } from './fixtures/rizline';
import type { RizlineCatalogData } from '@/domain/rizline';

vi.mock('@/components/CachedTabScreen', () => ({ useCachedTabActive: () => true }));
vi.mock('@/state/query-client', () => ({ queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }));
vi.mock('@/services/rizline-resources', () => ({ rizlineResources: { load: vi.fn(), loadFresh: vi.fn() } }));

const source = { kind: 'rizline' as const, label: 'Rizline 曲库', updatedAt: '2026-09-13', isStale: false };
const key = gameDataQueryKey('rizline:u1', 'rizline', 'rizline-official', 'rizline');
beforeEach(() => { queryClient.clear(); vi.clearAllMocks(); });
describe('Rizline catalog and account query coordination', () => {
  it('updates derived best groups after background metadata arrives without changing official RKS', async () => {
    const snapshot = { save: rizlineSave(), source };
    queryClient.setQueryData<GameDataBundle>(key, { gameId: 'rizline', providerId: 'rizline-official', profile: getGameProfile('rizline'),
      payload: rizlinePayloadFromSnapshot(snapshot) });
    let onFresh!: (data: RizlineCatalogData) => void;
    vi.mocked(rizlineResources.load).mockImplementation(async (_signal, callback) => {
      onFresh = callback!;
      return { snapshot: { ...rizlineCatalog(), songs: [] }, source: { ...source, isStale: true } };
    });
    await ensureRizlineCatalog();
    onFresh({ snapshot: rizlineCatalog(), source });
    const payload = queryClient.getQueryData<GameDataBundle>(key)!.payload;
    expect(payload.kind).toBe('rizline');
    if (payload.kind !== 'rizline') throw new Error('Wrong payload');
    expect(payload.best.ah5).toHaveLength(1);
    expect(payload.best.hasUnknownCandidates).toBe(false);
    expect(payload.player.totalRks).toBe(snapshot.save.totalRks);
    expect(payload.snapshot).toBe(snapshot);
  });
  it('retains valid account data after a failed catalog update', async () => {
    const bundle: GameDataBundle = { gameId: 'rizline', providerId: 'rizline-official', profile: getGameProfile('rizline'),
      payload: rizlinePayloadFromSnapshot({ save: rizlineSave(), source }, { snapshot: rizlineCatalog(), source }) };
    queryClient.setQueryData(key, bundle);
    vi.mocked(rizlineResources.loadFresh).mockRejectedValue(new Error('corrupt release'));
    await expect(refreshRizlineCatalog()).rejects.toThrow('corrupt release');
    expect(queryClient.getQueryData(key)).toBe(bundle);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InfiniteData } from '@tanstack/react-query';
import type { TufPassPage } from '@/domain/tuf';
import { prefetchTufPassPage } from '@/hooks/use-tuf';
import { queryClient } from '@/state/query-client';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';

const getPasses = vi.fn();
vi.mock('@/providers/tuf-provider', () => ({ tufProvider: { getPasses: (...args: unknown[]) => getPasses(...args) } }));
vi.mock('@/components/CachedTabScreen', () => ({ useCachedTabActive: () => true }));
vi.mock('@/state/app-lifecycle', () => ({
  useAppLifecycle: () => ({ foregroundReady: true, foregroundGeneration: 1 }),
  getForegroundAbortSignal: () => new AbortController().signal,
}));

const options = { sortBy: 'impact' as const, order: 'DESC' as const, bestPerLevel: true };
const key = (playerId: number) => ['tuf', 'player', playerId, 'passes', options] as const;
const page = (offset: number) => ({ offset, limit: 1, total: 3, passes: [] }) as unknown as TufPassPage;
const seed = (playerId: number) => queryClient.setQueryData<InfiniteData<TufPassPage>>(key(playerId), { pages: [page(0)], pageParams: [0] });
const offsets = (playerId: number) => queryClient.getQueryData<InfiniteData<TufPassPage>>(key(playerId))?.pages.map(item => item.offset);

describe('TUF pass prefetch commit guards', () => {
  beforeEach(() => { queryClient.clear(); getPasses.mockReset(); });

  it('merges a current page and passes the cancellation signal to the provider', async () => {
    seed(7);
    getPasses.mockResolvedValue(page(1));
    const controller = new AbortController();
    await prefetchTufPassPage(7, options, 1, controller.signal);
    expect(getPasses.mock.calls[0]![2]).toBe(controller.signal);
    expect(offsets(7)).toEqual([0, 1]);
  });

  it('does not merge a response that arrives after the request was cancelled', async () => {
    seed(7);
    const controller = new AbortController();
    getPasses.mockImplementation(async () => { controller.abort(new Error('cancelled')); return page(1); });
    await expect(prefetchTufPassPage(7, options, 1, controller.signal)).rejects.toThrow('cancelled');
    expect(offsets(7)).toEqual([0]);
  });

  it.each(['adofai', 'account:adofai:tuf:7'])('does not merge a response after %s writes were invalidated', async scope => {
    seed(7);
    getPasses.mockImplementation(async () => { invalidateResourceWrites(scope); return page(1); });
    await expect(prefetchTufPassPage(7, options, 1)).rejects.toThrow();
    expect(offsets(7)).toEqual([0]);
  });

  it('does not create pages for a player whose query was removed', async () => {
    getPasses.mockResolvedValue(page(1));
    await prefetchTufPassPage(9, options, 1);
    expect(offsets(9)).toBeUndefined();
  });
});

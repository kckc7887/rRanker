import { jest } from '@jest/globals';
import React, { type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { queryClient } from '@/state/query-client';
import { ensurePhigrosCatalog, refreshPhigrosCatalog, usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';

let mockRevision = 'r1';
let mockRelease: { revision: string } | undefined;
const mockLoad = jest.fn(async (..._args: unknown[]) => {
  if (mockRelease?.revision !== mockRevision) mockRelease = { revision: mockRevision };
  return mockRelease;
});
jest.mock('@/services/phigros-resources', () => ({ phigrosResources: {
  peek: () => mockRelease,
  load: (...args: unknown[]) => mockLoad(...args),
} }));
jest.mock('@/hooks/use-phigros-kyou', () => ({ loadPhigrosKyouAliases: async () => { throw new Error('offline aliases'); } }));
jest.mock('@/components/CachedTabScreen', () => ({ useCachedTabActive: () => true }));
jest.mock('@/providers/phigros-catalog-provider', () => ({ PhigrosCatalogProvider: class {
  async getCatalog() {
    return { songs: mockRevision === 'r1' ? [{ id: 'old' }] : [{ id: 'old' }, { id: 'new' }],
      source: { kind: 'generated', label: 'Phigros', updatedAt: mockRevision, isStale: false } };
  }
} }));

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

afterEach(() => queryClient.clear());

it('manual refresh rechecks once, shares concurrent consumers and preserves usable data on failure', async () => {
  const hook = await renderHook(() => usePhigrosCatalog(), { wrapper });
  await waitFor(() => expect(hook.result.current.data?.snapshot.songs).toHaveLength(1));
  const derived = new QueryObserver(queryClient, {
    queryKey: ['game-data', 'version', 'account', 'phigros'],
    queryFn: async () => (await ensurePhigrosCatalog(new PhigrosCatalogProvider())).snapshot.songs.length,
    staleTime: Infinity,
  });
  const unsubscribe = derived.subscribe(() => undefined);
  await waitFor(() => expect(derived.getCurrentResult().data).toBe(1));
  mockLoad.mockClear();
  mockRevision = 'r2';
  await act(async () => { await Promise.all([refreshPhigrosCatalog(), refreshPhigrosCatalog()]); });
  await waitFor(() => expect(hook.result.current.data?.snapshot.songs).toHaveLength(2));
  await waitFor(() => expect(derived.getCurrentResult().data).toBe(2));
  expect(mockLoad).toHaveBeenCalledTimes(1);
  expect(mockLoad).toHaveBeenCalledWith(expect.any(AbortSignal), true);
  mockLoad.mockClear();
  mockLoad.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { await expect(refreshPhigrosCatalog()).rejects.toThrow('offline'); });
  await waitFor(() => expect(hook.result.current.data?.snapshot.source.isStale).toBe(true));
  expect(hook.result.current.isError).toBe(false);
  expect(hook.result.current.data?.snapshot.songs).toHaveLength(2);
  expect(mockLoad).toHaveBeenCalledTimes(1);
  unsubscribe();
  await hook.unmount();
});

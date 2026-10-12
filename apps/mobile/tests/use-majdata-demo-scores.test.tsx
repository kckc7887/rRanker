import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { jest } from '@jest/globals';
import type { PropsWithChildren } from 'react';
import { useMajdataDemoScores, useMajdataRanking } from '@/hooks/use-majdata';
import { buildMaxedMajdataScore } from '@/providers/maxed-majdata-test-provider';
import type { MajdataSong } from '@/domain/majdata';

type Page = { records: ReturnType<typeof buildMaxedMajdataScore>[]; songCount: number };
const mockPage = jest.fn<(page: number, signal: AbortSignal) => Promise<Page>>();
const mockRanking = jest.fn(async () => ({ scores: [] }));
let mockAccountId = 'majdata-net:test';
let mockProviderId = 'majdata-net-test';
let mockActive = true;
const mockClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
jest.mock('@/services/majdata-service', () => ({
  loadMajdataDemoScoresPage: (page: number, signal: AbortSignal) => mockPage(page, signal),
}));
jest.mock('@/providers/majdata-provider', () => ({ majdataProvider: { getRanking: () => mockRanking() } }));
jest.mock('@/components/CachedTabScreen', () => ({ useCachedTabActive: () => mockActive }));
jest.mock('@/state/query-client', () => ({ queryClient: mockClient }));
jest.mock('@/state/session-store', () => ({ useSession: (selector: (state: object) => unknown) => selector({
  activeAccountId: mockAccountId, activeProviderId: mockProviderId,
}) }));

const song = (id: string): MajdataSong => ({
  id, title: id, artist: '', designer: '', uploader: '', description: '', timestamp: '2026-10-12', hash: 'revision',
  levels: ['', '', '', '', '14', '', ''], tags: [], publicTags: [],
});
const score = (id: string) => buildMaxedMajdataScore(song(id), 4, { tap: 1, hold: 0, slide: 0, touch: 0, break: 1 });
function wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={mockClient}>{children}</QueryClientProvider>; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  jest.clearAllMocks(); mockClient.clear(); mockAccountId = 'majdata-net:test'; mockProviderId = 'majdata-net-test'; mockActive = true;
  mockPage.mockReset();
  mockPage.mockResolvedValue({ records: [score('song-a')], songCount: 30 });
});
afterEach(async () => { await cleanup(); mockClient.clear(); });

it('shares best and records data and appends successful pages after retry without duplicate charts', async () => {
  mockPage.mockResolvedValueOnce({ records: [score('song-a')], songCount: 30 })
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ records: [score('song-a'), score('song-b')], songCount: 2 });
  const best = await renderHook(() => useMajdataDemoScores(), { wrapper });
  const records = await renderHook(() => useMajdataDemoScores(), { wrapper });
  await waitFor(() => expect(best.result.current.records.map(record => record.chartInfo.id)).toEqual(['song-a']));
  await act(async () => { await best.result.current.fetchNextPage(); });
  await waitFor(() => expect(best.result.current.isFetchNextPageError).toBe(true));
  expect(records.result.current.records.map(record => record.chartInfo.id)).toEqual(['song-a']);
  await act(async () => { await records.result.current.fetchNextPage(); });
  await waitFor(() => expect(best.result.current.records.map(record => record.chartInfo.id)).toEqual(['song-a', 'song-b']));
  await waitFor(() => expect(records.result.current.hasNextPage).toBe(false));
});

it('cancels an abandoned account page and ignores its late scores', async () => {
  const late = deferred<Page>();
  let oldSignal: AbortSignal | undefined;
  mockPage.mockResolvedValueOnce({ records: [score('song-a')], songCount: 30 })
    .mockImplementationOnce((_page, signal) => { oldSignal = signal; return late.promise; })
    .mockResolvedValueOnce({ records: [score('song-new-account')], songCount: 1 });
  const hook = await renderHook(() => useMajdataDemoScores(), { wrapper });
  await waitFor(() => expect(hook.result.current.records.map(record => record.chartInfo.id)).toEqual(['song-a']));
  let pending: ReturnType<typeof hook.result.current.fetchNextPage> | undefined;
  await act(() => { pending = hook.result.current.fetchNextPage(); });
  await waitFor(() => expect(oldSignal).toBeDefined());
  mockAccountId = 'majdata-net:another-example';
  await hook.rerender({});
  await waitFor(() => expect(hook.result.current.records.map(record => record.chartInfo.id)).toEqual(['song-new-account']));
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => { late.resolve({ records: [score('late-song')], songCount: 1 }); await pending; });
  expect(hook.result.current.records.map(record => record.chartInfo.id)).toEqual(['song-new-account']);
});

it('keeps generated account lists and rankings off the real player paths', async () => {
  await renderHook(() => useMajdataRanking('song-a', true), { wrapper });
  expect(mockRanking).not.toHaveBeenCalled();
  mockProviderId = 'majdata-net';
  const hook = await renderHook(() => useMajdataDemoScores(), { wrapper });
  expect(hook.result.current.bound).toBe(false);
  expect(mockPage).not.toHaveBeenCalled();
});

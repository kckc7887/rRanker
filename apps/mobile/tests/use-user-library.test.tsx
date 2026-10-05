import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { jest } from '@jest/globals';
import type { GameId } from '@/domain/game-bind-options';
import type { LibraryTarget, UserLibraryItem } from '@/domain/user-library';
import { useUserLibrary } from '@/hooks/use-user-library';
import { queryClient } from '@/state/query-client';

let mockGameId: GameId = 'rizline';
let mockActive = true;
let mockForegroundReady = true;
let mockForegroundGeneration = 0;
let mockForeground = new AbortController();
const mockNotify = jest.fn();
const mockFavorite = jest.fn<(gameId: GameId, songId: string, value: boolean) => Promise<UserLibraryItem[]>>();
const mockPractice = jest.fn<(gameId: GameId, songId: string, type: string, index: number, value: boolean) => Promise<UserLibraryItem[]>>();
const mockTags = jest.fn<(target: LibraryTarget, values: string[]) => Promise<UserLibraryItem[]>>();
const mockPresets = jest.fn<(values: string[]) => Promise<string[]>>();

jest.mock('@/state/query-client', () => {
  const { QueryClient } = jest.requireActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return { queryClient: new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity },
  } }) };
});
jest.mock('@/services/user-library-service', () => ({ UserLibraryService: class {
  list = async () => [];
  listTagPresets = async () => [];
  setSongFavorite = (...args: Parameters<typeof mockFavorite>) => mockFavorite(...args);
  setChartPractice = (...args: Parameters<typeof mockPractice>) => mockPractice(...args);
  setTags = (...args: Parameters<typeof mockTags>) => mockTags(...args);
  setTagPresets = (...args: Parameters<typeof mockPresets>) => mockPresets(...args);
} }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showNotification: mockNotify }) }));
jest.mock('@/components/CachedTabScreen', () => ({ useCachedTabActive: () => mockActive }));
jest.mock('@/state/app-lifecycle', () => ({
  getForegroundAbortSignal: () => mockForeground.signal,
  useAppLifecycle: () => ({ foregroundReady: mockForegroundReady, foregroundGeneration: mockForegroundGeneration }),
}));
jest.mock('@/state/session-store', () => ({ useSession: Object.assign(
  (selector: (state: { activeGameId: GameId }) => unknown) => selector({ activeGameId: mockGameId }),
  { getState: () => ({ activeGameId: mockGameId }) },
) }));
jest.mock('@/services/runtime-diagnostics-recorder', () => ({ createRuntimeOperation: () => ({ record: jest.fn() }) }));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function pendingWrite() {
  let reject!: (error: Error) => void;
  let resolve!: (items: UserLibraryItem[]) => void;
  const promise = new Promise<UserLibraryItem[]>((done, fail) => { resolve = done; reject = fail; });
  return { promise, reject, resolve };
}

async function loadHook() {
  const hook = await renderHook(() => useUserLibrary(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading || hook.result.current.tagPresetsLoading).toBe(false));
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
  mockGameId = 'rizline'; mockActive = true; mockForegroundReady = true; mockForegroundGeneration = 0;
  mockForeground = new AbortController();
  mockFavorite.mockResolvedValue([]); mockPractice.mockResolvedValue([]);
  mockTags.mockResolvedValue([]); mockPresets.mockResolvedValue([]);
});

afterEach(async () => { await cleanup(); queryClient.clear(); });

/** React Query 的观察更新晚于写入 Promise 完成。 */
const publishUpdates = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });

describe('公共个人条目写入边界', () => {
  it('coalesces duplicate favorites and handles failure once without exposing error text', async () => {
    const write = pendingWrite(); mockFavorite.mockReturnValue(write.promise);
    const hook = await loadHook();
    let first!: ReturnType<typeof hook.result.current.setSongFavorite>;
    let second!: typeof first;
    await act(() => {
      first = hook.result.current.setSongFavorite('song', true);
      second = hook.result.current.setSongFavorite('song', true);
    });
    expect(second).toBe(first);
    await waitFor(() => expect(mockFavorite).toHaveBeenCalledTimes(1));
    await act(async () => {
      write.reject(new Error('private storage payload'));
      expect(await first).toBeUndefined(); expect(await second).toBeUndefined();
      await publishUpdates();
    });
    await waitFor(() => expect(hook.result.current.isUpdating).toBe(false));
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith({ title: '收藏保存失败', message: '请重试。', variant: 'error' });
  });

  it('handles practice failure through the same public path', async () => {
    mockPractice.mockRejectedValue(new Error('write failed'));
    const hook = await loadHook();
    await act(async () => {
      expect(await hook.result.current.setChartPractice('song', 'SD', 2, true)).toBeUndefined();
      await publishUpdates();
    });
    await waitFor(() => expect(hook.result.current.isUpdating).toBe(false));
    expect(mockNotify).toHaveBeenCalledWith({ title: '练习清单保存失败', message: '请重试。', variant: 'error' });
  });

  it.each(['hidden', 'game-switch', 'background', 'unmount'])('suppresses late failure after %s', async (transition) => {
    const write = pendingWrite(); mockFavorite.mockReturnValue(write.promise);
    const hook = await loadHook();
    let result!: ReturnType<typeof hook.result.current.setSongFavorite>;
    await act(() => { result = hook.result.current.setSongFavorite('song', true); });
    await waitFor(() => expect(mockFavorite).toHaveBeenCalledTimes(1));
    if (transition === 'unmount') await hook.unmount();
    else {
      if (transition === 'hidden') mockActive = false;
      if (transition === 'game-switch') mockGameId = 'maimai';
      if (transition === 'background') { mockForeground.abort(); mockForegroundReady = false; }
      await hook.rerender(undefined);
      mockGameId = 'rizline'; mockActive = true; mockForegroundReady = true; mockForegroundGeneration += 1;
      mockForeground = new AbortController();
      await hook.rerender(undefined);
    }
    await act(async () => { write.reject(new Error('write failed')); expect(await result).toBeUndefined(); await publishUpdates(); });
    if (transition !== 'unmount') await waitFor(() => expect(hook.result.current.isUpdating).toBe(false));
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('updates the original game cache after switching games', async () => {
    const write = pendingWrite(); mockFavorite.mockReturnValue(write.promise);
    const hook = await loadHook();
    let result!: ReturnType<typeof hook.result.current.setSongFavorite>;
    await act(() => { result = hook.result.current.setSongFavorite('song', true); });
    mockGameId = 'maimai'; await hook.rerender(undefined);
    const item: UserLibraryItem = { key: 'song:rizline:song', kind: 'song', gameId: 'rizline', songId: 'song',
      favorite: true, tags: [], createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z' };
    await act(async () => { write.resolve([item]); expect(await result).toEqual([item]); await publishUpdates(); });
    await waitFor(() => expect(hook.result.current.isUpdating).toBe(false));
    expect(queryClient.getQueryData(['user-library', 'rizline'])).toEqual([item]);
    expect(queryClient.getQueryData(['user-library', 'maimai'])).toEqual([]);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('keeps tag and preset rejection for the editor to handle locally', async () => {
    const error = new Error('write failed'); mockTags.mockRejectedValue(error); mockPresets.mockRejectedValue(error);
    const hook = await loadHook();
    await act(async () => {
      await expect(hook.result.current.setTags({ kind: 'song', songId: 'song' }, ['tag'])).rejects.toBe(error);
      await expect(hook.result.current.setTagPresets(['tag'])).rejects.toBe(error);
      await publishUpdates();
    });
    await waitFor(() => expect(hook.result.current.isUpdating).toBe(false));
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

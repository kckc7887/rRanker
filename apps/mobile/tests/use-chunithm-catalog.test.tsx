import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { jest } from '@jest/globals';
import type { ChunithmAliasSnapshot, ChunithmCatalogSnapshot } from '@/domain/chunithm';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { queryClient } from '@/state/query-client';
import {
  CHUNITHM_ALIAS_SCHEMA_VERSION,
  CHUNITHM_CATALOG_SCHEMA_VERSION,
  loadChunithmAliases,
  loadChunithmCatalog,
} from '@/services/chunithm-catalog-loader';

jest.mock('@/state/query-client', () => {
  const { QueryClient } = jest.requireActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  );
  return {
    queryClient: new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,
          retry: 1,
          refetchOnWindowFocus: false,
          gcTime: 0,
        },
      },
    }),
  };
});

jest.mock('@/storage/sqlite-snapshot-repository', () => {
  const store = new Map<string, unknown>();
  class FakeRepository {
    getResource = async <T,>(key: string, version: number) => (
      store.get(`${key}@${version}`) as T | null
    );
    saveResource = async (_key: string, _version: number, _updatedAt: string, value: unknown) => {
      store.set(`${_key}@${_version}`, value);
    };
    deleteResource = async () => undefined;
  }
  return {
    SqliteSnapshotRepository: FakeRepository,
    __snapshotStore: store,
  };
});

jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: { activeGameId: 'chunithm' }) => unknown) => (
    selector({ activeGameId: 'chunithm' })
  ),
}));

jest.mock('@/services/chunithm-catalog-loader', () => {
  const actual = jest.requireActual<typeof import('@/services/chunithm-catalog-loader')>(
    '@/services/chunithm-catalog-loader',
  );
  return {
    ...actual,
    loadChunithmCatalog: jest.fn(),
    loadChunithmAliases: jest.fn(),
  };
});

const source = {
  kind: 'lxns' as const,
  label: 'LXNS 中二节奏公共曲库',
  updatedAt: '2026-08-10T00:00:00.000Z',
  isStale: false,
};

const cachedCatalog: ChunithmCatalogSnapshot = {
  currentVersion: { id: 23000, title: 'CHUNITHM VERSE' },
  versions: [{ id: 23000, title: 'CHUNITHM VERSE' }],
  genres: [{ id: 1, title: '其他游戏' }],
  source,
  songs: [
    {
      id: 1,
      title: '缓存曲目',
      artist: '缓存作者',
      genre: '其他游戏',
      bpm: 170,
      versionId: 23000,
      versionTitle: 'CHUNITHM VERSE',
      locked: false,
      disabled: false,
      difficulties: [],
    },
  ],
};

const cachedAliases: ChunithmAliasSnapshot = {
  aliases: [{ songId: '1', aliases: ['缓存别名'] }],
  source: { ...source, label: 'LXNS 中二别名库' },
};

const freshCatalog: ChunithmCatalogSnapshot = {
  ...cachedCatalog,
  source: { ...source, updatedAt: '2026-08-10T01:00:00.000Z' },
  songs: [{ ...cachedCatalog.songs[0], title: '新曲目' }],
};

const freshAliases: ChunithmAliasSnapshot = {
  aliases: [{ songId: '1', aliases: ['新别名'] }],
  source: { ...source, label: 'LXNS 中二别名库' },
};

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useChunithmCatalog 缓存优先', () => {
  beforeEach(() => {
    const storage = jest.requireMock('@/storage/sqlite-snapshot-repository') as {
      __snapshotStore: Map<string, unknown>;
    };
    storage.__snapshotStore.clear();
    queryClient.clear();
    jest.mocked(loadChunithmCatalog).mockReset();
    jest.mocked(loadChunithmAliases).mockReset();
  });

  it('有本地缓存时先渲染缓存快照（含缓存别名合并），后台刷新成功后回写新数据', async () => {
    const storage = jest.requireMock('@/storage/sqlite-snapshot-repository') as {
      __snapshotStore: Map<string, unknown>;
    };
    storage.__snapshotStore.set(`chunithm-catalog@${CHUNITHM_CATALOG_SCHEMA_VERSION}`, cachedCatalog);
    storage.__snapshotStore.set(`chunithm-alias@${CHUNITHM_ALIAS_SCHEMA_VERSION}`, cachedAliases);

    let resolveFresh: (value: ChunithmCatalogSnapshot) => void = () => undefined;
    jest.mocked(loadChunithmCatalog).mockImplementation(
      () => new Promise<ChunithmCatalogSnapshot>((resolve) => {
        resolveFresh = resolve;
      }),
    );
    jest.mocked(loadChunithmAliases).mockResolvedValue(freshAliases);

    const { result } = await renderHook(() => useChunithmCatalog(), { wrapper });

    await waitFor(() => expect(result.current?.data).toBeDefined());
    expect(result.current?.data?.songs[0].title).toBe('缓存曲目');
    expect(result.current?.data?.songs[0].aliases).toEqual(['缓存别名']);
    expect(result.current?.data?.source.isStale).toBe(true);

    expect(loadChunithmCatalog).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFresh(freshCatalog);
    });
    await waitFor(() => expect(result.current?.data?.songs[0].title).toBe('新曲目'));
    expect(result.current?.data?.songs[0].aliases).toEqual(['新别名']);
    expect(result.current?.data?.source.isStale).toBe(false);
  });

  it('无本地缓存时直接走网络并返回新数据', async () => {
    jest.mocked(loadChunithmCatalog).mockResolvedValue(freshCatalog);
    jest.mocked(loadChunithmAliases).mockResolvedValue(freshAliases);

    const { result } = await renderHook(() => useChunithmCatalog(), { wrapper });

    await waitFor(() => expect(result.current?.data).toBeDefined());
    expect(result.current?.data?.songs[0].title).toBe('新曲目');
    expect(result.current?.data?.songs[0].aliases).toEqual(['新别名']);
    expect(loadChunithmCatalog).toHaveBeenCalledTimes(1);
  });
});

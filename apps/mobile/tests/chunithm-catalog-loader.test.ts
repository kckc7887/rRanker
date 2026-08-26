import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHUNITHM_ALIAS_SCHEMA_VERSION,
  loadChunithmAliases,
} from '@/services/chunithm-catalog-loader';

const aliasPayload = {
  aliases: [
    { song_id: 3, aliases: ['bbkkbkk', 'bk'] },
    { song_id: 7, aliases: ['初音未来的消失', '消失'] },
  ],
};

vi.mock('@/storage/sqlite-snapshot-repository', () => {
  const store = new Map<string, unknown>();
  class FakeRepository {
    saveResource = vi.fn(async (_key: string, _version: number, _updatedAt: string, value: unknown) => {
      store.set(`${_key}@${_version}`, value);
    });
    getResource = vi.fn(async <T,>(key: string, version: number) => (
      store.get(`${key}@${version}`) as T | null
    ));
    deleteResource = vi.fn(async () => undefined);
  }
  return {
    SqliteSnapshotRepository: FakeRepository,
    __resetFakeResourceStore: () => store.clear(),
    __getFakeResourceStore: () => store,
  };
});

vi.mock('@/providers/chunithm-catalog-provider', async () => {
  const actual = await vi.importActual<typeof import('@/providers/chunithm-catalog-provider')>(
    '@/providers/chunithm-catalog-provider',
  );
  return {
    ...actual,
    ChunithmCatalogProvider: class {
      async getAliases() {
        return actual.mapChunithmAliases({ ...aliasPayload });
      }
    },
  };
});

describe('loadChunithmAliases', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const storage = await import('@/storage/sqlite-snapshot-repository');
    (storage as unknown as { __resetFakeResourceStore: () => void })
      .__resetFakeResourceStore();
  });

  it('loads and persists the alias snapshot under the chunithm alias resource', async () => {
    const result = await loadChunithmAliases();

    expect(result.aliases).toEqual([
      { songId: '3', aliases: ['bbkkbkk', 'bk'] },
      { songId: '7', aliases: ['初音未来的消失', '消失'] },
    ]);
    expect(result.source).toMatchObject({
      kind: 'lxns',
      label: 'LXNS 中二别名库',
      isStale: false,
    });
    const storage = await import('@/storage/sqlite-snapshot-repository');
    const store = (storage as unknown as { __getFakeResourceStore: () => Map<string, unknown> })
      .__getFakeResourceStore();
    expect(store.get(`chunithm-alias@${CHUNITHM_ALIAS_SCHEMA_VERSION}`))
      .toEqual(expect.objectContaining({ aliases: result.aliases }));
  });

  it('falls back to the cached alias snapshot when the network fails', async () => {
    const first = await loadChunithmAliases();
    expect(first.source.isStale).toBe(false);

    const providerModule = await import('@/providers/chunithm-catalog-provider');
    const prototype = providerModule.ChunithmCatalogProvider.prototype as {
      getAliases: () => Promise<unknown>;
    };
    vi.spyOn(prototype, 'getAliases').mockRejectedValueOnce(new Error('network'));

    const second = await loadChunithmAliases();
    expect(second.aliases).toEqual(first.aliases);
    expect(second.source).toMatchObject({ kind: 'cache', isStale: true });
  });
});

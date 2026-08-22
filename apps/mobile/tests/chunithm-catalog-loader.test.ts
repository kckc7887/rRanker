import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadChunithmAliases } from '@/services/chunithm-catalog-loader';

const aliasPayload = {
  aliases: [
    { song_id: 3, aliases: ['bbkkbkk', 'bk'] },
    { song_id: 7, aliases: ['初音未来的消失', '消失'] },
  ],
};

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the public alias snapshot for the current session', async () => {
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
  });

  it('does not provide a cold-start disk fallback when the network fails', async () => {
    const providerModule = await import('@/providers/chunithm-catalog-provider');
    const prototype = providerModule.ChunithmCatalogProvider.prototype as {
      getAliases: () => Promise<unknown>;
    };
    vi.spyOn(prototype, 'getAliases').mockRejectedValueOnce(new Error('network'));

    await expect(loadChunithmAliases()).rejects.toThrow('network');
  });
});

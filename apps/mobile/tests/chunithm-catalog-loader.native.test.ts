import { loadChunithmAliases } from '@rranker/game-chunithm/services/chunithm-catalog-loader';

const mockAliasPayload = {
  aliases: [
    { song_id: 3, aliases: ['bbkkbkk', 'bk'] },
    { song_id: 7, aliases: ['初音未来的消失', '消失'] },
  ],
};

jest.mock('@rranker/provider-lxns/providers/chunithm-catalog-provider', () => {
  const actual = jest.requireActual<typeof import('@rranker/provider-lxns/providers/chunithm-catalog-provider')>(
    '@rranker/provider-lxns/providers/chunithm-catalog-provider',
  );
  return {
    ...actual,
    ChunithmCatalogProvider: class {
      async getAliases() {
        return actual.mapChunithmAliases({ ...mockAliasPayload });
      }
    },
  };
});

describe('loadChunithmAliases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    const providerModule = await import('@rranker/provider-lxns/providers/chunithm-catalog-provider');
    const prototype = providerModule.ChunithmCatalogProvider.prototype as {
      getAliases: () => Promise<unknown>;
    };
    jest.spyOn(prototype, 'getAliases').mockRejectedValueOnce(new Error('network'));

    await expect(loadChunithmAliases()).rejects.toThrow('network');
  });
});

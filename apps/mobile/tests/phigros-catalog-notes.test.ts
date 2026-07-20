import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { PHIGROS_OSS_BASE } from '@/domain/account-avatar';

const OSS = PHIGROS_OSS_BASE;

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function textResponse(body: string, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    json: async () => ({}),
    text: async () => body,
  } as Response;
}

describe('PhigrosCatalogProvider note counts fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('falls back to version path when current.noteCounts is missing', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/phigros/current.json')) {
        return jsonResponse({
          schemaVersion: 1,
          gameVersion: '3.19.4',
          catalog: 'phigros/releases/3.19.4/catalog.json',
          manifest: 'phigros/releases/3.19.4/manifest.json',
        });
      }
      if (url.endsWith('/catalog.json')) {
        return jsonResponse({
          schemaVersion: 1,
          songCount: 1,
          songs: [{
            id: 'Song.A',
            title: 'A',
            composer: 'C',
            illustrator: 'I',
            charters: ['e', 'h', 'i'],
            difficulties: [1, 2, 3],
          }],
        });
      }
      if (url.endsWith('/metadata/note_counts.tsv')) {
        return textResponse('Song.A.0\t[1,2,3,4]\t[5,6,7,8]\t[9,10,11,12]');
      }
      return textResponse('', false);
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new PhigrosCatalogProvider();
    const catalog = await provider.getCatalog();
    expect(catalog.songs[0]?.charts[2]?.notes).toEqual({
      tap: 9, hold: 10, drag: 11, flick: 12, total: 42,
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/metadata/note_counts.tsv'))).toBe(true);
  });

  it('re-fetches latest current.json when first note counts paths are empty', async () => {
    let currentHits = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/phigros/current.json')) {
        currentHits += 1;
        if (currentHits === 1) {
          return jsonResponse({
            schemaVersion: 1,
            gameVersion: '3.19.0',
            catalog: 'phigros/releases/3.19.0/catalog.json',
            manifest: 'phigros/releases/3.19.0/manifest.json',
            noteCounts: 'phigros/releases/3.19.0/metadata/note_counts.tsv',
          });
        }
        return jsonResponse({
          schemaVersion: 1,
          gameVersion: '3.19.4',
          catalog: 'phigros/releases/3.19.4/catalog.json',
          manifest: 'phigros/releases/3.19.4/manifest.json',
          noteCounts: 'phigros/releases/3.19.4/metadata/note_counts.tsv',
        });
      }
      if (url.endsWith('/3.19.0/catalog.json')) {
        return jsonResponse({
          schemaVersion: 1,
          songCount: 1,
          songs: [{
            id: 'Song.A',
            title: 'A',
            composer: 'C',
            illustrator: 'I',
            charters: ['e', 'h', 'i'],
            difficulties: [1, 2, 3],
          }],
        });
      }
      if (url.endsWith('/3.19.0/metadata/note_counts.tsv')) {
        return textResponse('');
      }
      if (url.endsWith('/3.19.4/metadata/note_counts.tsv')) {
        return textResponse('Song.A.0\t[10,0,0,0]\t[20,0,0,0]\t[30,0,0,0]');
      }
      return textResponse('', false);
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new PhigrosCatalogProvider();
    const catalog = await provider.getCatalog();
    expect(currentHits).toBeGreaterThanOrEqual(2);
    expect(catalog.songs[0]?.charts[0]?.notes?.total).toBe(10);
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain(OSS);
  });
});

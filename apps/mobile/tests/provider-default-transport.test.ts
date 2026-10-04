import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MuseDashProvider } from '@/providers/muse-dash-provider';
import { TufProvider } from '@/providers/tuf-provider';
import { DxRatingChartTagsProvider } from '@/providers/dxrating-chart-tags-provider';
import { PhigrosKyouProvider } from '@/providers/phigros-kyou-provider';
import { PROVIDER_MAX_RESPONSE_BYTES } from '@/providers/http-json';
import { PhigrosResourceService } from '@/services/phigros-resources';
import { RizlineResourceService, rizlineResources } from '@/services/rizline-resources';
import { loadRizlineChartPreviewResources } from '@/services/rizline-chart-preview-resources';
import { requestDeviceCode } from '@/providers/phigros-auth';
import { rizlineCatalog, rizlineCatalogAssetFiles } from './fixtures/rizline';

const transport = vi.hoisted(() => ({ fetch: vi.fn<typeof fetch>() }));
vi.mock('expo/fetch', () => ({ fetch: transport.fetch }));

beforeEach(() => { transport.fetch.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

const defaultRequests: [string, () => Promise<unknown>, number][] = [
  ['MuseDash player search', () => new MuseDashProvider().searchPlayers('fixture'), 1],
  ['Phigros device code', () => requestDeviceCode(), 1],
  ['TUF player search', () => new TufProvider().searchPlayers('fixture'), 1],
  ['DXRating tags', () => new DxRatingChartTagsProvider().getChartTags(), 1],
  ['Kyou metadata', () => new PhigrosKyouProvider().getAliases(), 3],
  ['Phigros release', () => new PhigrosResourceService().load(), 2],
  ['Phigros bytes', () => new PhigrosResourceService().bytes('https://resource.test/chart'), 1],
  ['Rizline release', () => new RizlineResourceService().withRelease(async (release) => release), 2],
  ['Rizline preview bytes', async () => {
    const snapshot = rizlineCatalog();
    const release = vi.spyOn(rizlineResources, 'withRelease').mockImplementation(async action => action({
      snapshot,
      source: { kind: 'rizline', label: 'Rizline 曲库', updatedAt: '', isStale: false },
      files: rizlineCatalogAssetFiles(snapshot).map(file => ({ ...file, sha256: 'a'.repeat(64) })),
    }));
    try {
      return await loadRizlineChartPreviewResources({ songId: 'Song.A.0', levelIndex: 2 }, new AbortController().signal);
    } finally {
      release.mockRestore();
    }
  }, 1],
];

describe('production default transports use the shared streaming reader', () => {
  it.each(defaultRequests)('%s stops actual stream bytes before a complete body allocation', async (_name, action, requests) => {
    const globalFetch = vi.fn(() => { throw new Error('ambient fetch must not be used'); });
    vi.stubGlobal('fetch', globalFetch);
    const cancel = vi.fn();
    const chunk = new Uint8Array(PROVIDER_MAX_RESPONSE_BYTES / 8);
    const fullBody = vi.fn(async () => new ArrayBuffer(0));
    transport.fetch.mockImplementation(async () => {
      const response = new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          for (let index = 0; index < 9; index += 1) controller.enqueue(chunk);
        },
        cancel,
      }), { headers: { 'Content-Length': '1' } });
      Object.defineProperty(response, 'arrayBuffer', { value: fullBody, configurable: true, writable: true });
      return response;
    });
    await expect(action()).rejects.toMatchObject({ code: 'upstream_schema', retryable: false });
    expect(transport.fetch).toHaveBeenCalledTimes(requests);
    expect(globalFetch).not.toHaveBeenCalled();
    expect(fullBody).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(requests));
  });

  it.each(['musedash', 'tuf', 'rizline'] as const)('%s keeps an explicitly injected fetcher', async (name) => {
    const fetcher = vi.fn(async () => new Response('', { status: 403 }));
    const injected = fetcher as unknown as typeof fetch;
    const action = name === 'musedash'
      ? new MuseDashProvider(injected).searchPlayers('fixture')
      : name === 'tuf'
        ? new TufProvider(injected).searchPlayers('fixture')
        : new RizlineResourceService(undefined, injected).withRelease(async (release) => release);
    await expect(action).rejects.toMatchObject({ code: name === 'rizline' ? 'network' : 'permission' });
    expect(fetcher).toHaveBeenCalledTimes(name === 'rizline' ? 2 : 1);
    expect(transport.fetch).not.toHaveBeenCalled();
  });
});

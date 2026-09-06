import { afterEach, expect, it, vi } from 'vitest';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { PhigrosResourceService } from '@/services/phigros-resources';
import { releaseFixture } from './fixtures/phigros-release';

afterEach(() => vi.unstubAllGlobals());

it('maps verified note counts and refreshes same-version resources without mixing releases', async () => {
  let fixture = releaseFixture();
  vi.stubGlobal('fetch', vi.fn(async (input) => fixture.respond(input)));
  const resources = new PhigrosResourceService('https://example.com');
  const provider = new PhigrosCatalogProvider(resources);
  const first = await provider.getCatalog();
  expect(first.songs[0]?.charts[0]?.notes).toEqual({ tap: 1, hold: 2, drag: 3, flick: 4, total: 10 });
  expect(await provider.getCatalog()).toBe(first);
  fixture = releaseFixture('r2', ['Song.A', 'Song.New']);
  await resources.load(undefined, true);
  const second = await provider.getCatalog();
  expect(second.songs).toHaveLength(2);
  expect(provider.getIllustrationUrl('Song.New')).toContain('?v=r2');
  expect(await provider.getGameVersion()).toBe('9.9.9');
});

it('keeps the successful catalog and update timestamp after a failed release refresh', async () => {
  const fixture = releaseFixture();
  const fetcher = vi.fn(async (input: RequestInfo | URL) => fixture.respond(input));
  vi.stubGlobal('fetch', fetcher);
  const resources = new PhigrosResourceService('https://example.com');
  const provider = new PhigrosCatalogProvider(resources);
  expect(provider.getResourceUpdatedAt()).toBeNull();
  const catalog = await provider.getCatalog();
  const timestamp = provider.getResourceUpdatedAt();
  fetcher.mockImplementation(async () => new Response('', { status: 503 }));
  await expect(resources.load(undefined, true)).rejects.toThrow();
  expect(await provider.getCatalog()).toBe(catalog);
  expect(provider.getResourceUpdatedAt()).toBe(timestamp);
});

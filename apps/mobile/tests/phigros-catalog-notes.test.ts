import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { phigrosResources } from '@/services/phigros-resources';
import { releaseFixture } from './fixtures/phigros-release';

beforeEach(() => phigrosResources.clear());
afterEach(() => { phigrosResources.clear(); vi.unstubAllGlobals(); });

it('maps verified note counts and refreshes same-version resources without mixing releases', async () => {
  let fixture = releaseFixture();
  vi.stubGlobal('fetch', vi.fn(async (input) => fixture.respond(input)));
  const resources = phigrosResources;
  const provider = new PhigrosCatalogProvider();
  const first = await provider.getCatalog();
  expect(first.songs[0]?.charts[0]?.notes).toEqual({ tap: 1, hold: 2, drag: 3, flick: 4, total: 10 });
  expect(await provider.getCatalog()).toBe(first);
  fixture = releaseFixture('r2', ['Song.A', 'Song.New'], {
    noteCounts: 'Song.A.0\t[1,2,3,4,7]\nSong.New.0\t[1,2,3,4,0]',
  });
  await resources.load(undefined, true);
  const second = await provider.getCatalog();
  expect(second.songs).toHaveLength(2);
  expect(second.songs[0]?.charts[0]?.notes).toEqual({ tap: 1, hold: 2, drag: 3, flick: 4, block: 7, total: 10 });
  expect(second.songs[1]?.charts[0]?.notes).toEqual({ tap: 1, hold: 2, drag: 3, flick: 4, total: 10 });
  expect(provider.getIllustrationUrl('Song.New')).toContain(fixture.objectKeys['illustrations/Song.New.png']);
  expect(await provider.getGameVersion()).toBe('9.9.9');
});

it('maps illustration and avatar logical names to immutable objects', async () => {
  const fixture = releaseFixture('9.9.9-deadbeef', ['Song.A']);
  vi.stubGlobal('fetch', vi.fn(async (input) => fixture.respond(input)));
  const provider = new PhigrosCatalogProvider();
  await provider.getCatalog();
  expect(provider.getIllustrationUrl('Song.A')).toBe(
    `https://rranker-phigros-data.cn-nb1.rains3.com/${fixture.objectKeys['illustrations/Song.A.png']}`,
  );
  expect(provider.getIllustrationUrl('missing')).toBeNull();
  expect(provider.getAvatarUrl('Glaciaxion')).toBe(
    `https://rranker-phigros-data.cn-nb1.rains3.com/${fixture.objectKeys['avatars/Glaciaxion.png']}`,
  );
});

it('keeps the successful catalog and update timestamp after a failed release refresh', async () => {
  const fixture = releaseFixture();
  const fetcher = vi.fn(async (input: RequestInfo | URL) => fixture.respond(input));
  vi.stubGlobal('fetch', fetcher);
  const resources = phigrosResources;
  const provider = new PhigrosCatalogProvider();
  expect(provider.getResourceUpdatedAt()).toBeNull();
  const catalog = await provider.getCatalog();
  const timestamp = provider.getResourceUpdatedAt();
  fetcher.mockImplementation(async () => new Response('', { status: 503 }));
  await expect(resources.load(undefined, true)).rejects.toThrow();
  expect(await provider.getCatalog()).toBe(catalog);
  expect(provider.getResourceUpdatedAt()).toBe(timestamp);
});

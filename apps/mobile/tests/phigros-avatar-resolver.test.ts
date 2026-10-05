import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPhigrosAvatarCatalog, resolvePhigrosAvatarUrl } from '@/services/phigros-avatar-resolver';
import { phigrosResources } from '@/services/phigros-resources';
import { PHIGROS_OSS_BASE } from '@/domain/account-avatar';
import { releaseFixture } from './fixtures/phigros-release';

let release: ReturnType<typeof releaseFixture>;
let revision = 0;
beforeEach(() => {
  phigrosResources.clear();
  release = releaseFixture(`r${++revision}`, ['Song.A'], { avatars: {
    'Cipher : /2&//<|0': 'Cipher1', 'Cipher alias': 'Cipher1', Glaciaxion: 'Glaciaxion', 'A+B#?': 'A+B#?',
  } });
  vi.stubGlobal('fetch', vi.fn(async input => release.respond(input)));
});
afterEach(() => { phigrosResources.clear(); vi.unstubAllGlobals(); });

describe('phigros avatar resolver', () => {
  it.each(['Cipher1', 'avatar.Cipher1', ' Cipher : /2&//<|0 '])('maps %s through the manifest', async key => {
    await expect(resolvePhigrosAvatarUrl(key)).resolves.toBe(`${PHIGROS_OSS_BASE}/${release.objectKeys['avatars/Cipher1.png']}`);
  });
  it('maps special characters in logical names without exposing them in object URLs', async () => {
    await expect(resolvePhigrosAvatarUrl('A+B#?')).resolves.toBe(`${PHIGROS_OSS_BASE}/${release.objectKeys['avatars/A+B#?.png']}`);
    await expect(resolvePhigrosAvatarUrl('missing')).resolves.toBeNull();
  });
  it('lists each published avatar once in alphabetical order', async () => {
    await expect(loadPhigrosAvatarCatalog()).resolves.toEqual(['A+B#?', 'Cipher1', 'Glaciaxion']);
  });
  it('uses the new alias mapping after a verified release refresh', async () => {
    await resolvePhigrosAvatarUrl('Cipher : /2&//<|0');
    release = releaseFixture(`r${++revision}`, ['Song.A'], { avatars: { 'Cipher : /2&//<|0': 'Cipher2' } });
    await phigrosResources.load(undefined, true);
    await expect(resolvePhigrosAvatarUrl('Cipher : /2&//<|0')).resolves.toBe(`${PHIGROS_OSS_BASE}/${release.objectKeys['avatars/Cipher2.png']}`);
  });
  it('returns no avatar when the current release is unavailable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('unavailable'));
    await expect(resolvePhigrosAvatarUrl('Cipher1')).resolves.toBeNull();
    await expect(loadPhigrosAvatarCatalog()).rejects.toThrow();
  });
  it('preserves cancellation', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);
    await expect(resolvePhigrosAvatarUrl('Cipher1', controller.signal)).rejects.toBe(reason);
  });
});

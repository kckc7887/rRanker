import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPhigrosAvatarCatalog, resolvePhigrosAvatarUrl } from '@/services/phigros-avatar-resolver';
import { phigrosResources, type PhigrosRelease } from '@/services/phigros-resources';

vi.mock('@/services/phigros-resources', () => ({ phigrosResources: { load: vi.fn() } }));

let revision = 0;
let release: PhigrosRelease;

beforeEach(() => {
  release = {
    revision: `r${++revision}`,
    avatarAliases: 'Cipher : /2&//<|0\tCipher1\nGlaciaxion\tGlaciaxion\n',
    current: { manifest: 'phigros/releases/3.19.4-deadbeef/manifest.json', resourceVersion: '3.19.4-deadbeef' },
  } as PhigrosRelease;
  vi.mocked(phigrosResources.load).mockReset().mockResolvedValue(release);
});

afterEach(() => { vi.restoreAllMocks(); });

describe('phigros avatar resolver', () => {
  it.each(['Cipher1', 'avatar.Cipher1', ' Cipher : /2&//<|0 '])('resolves %s in the current published directory', async key => {
    await expect(resolvePhigrosAvatarUrl(key)).resolves.toBe(
      'https://rranker-phigros-data.cn-nb1.rains3.com/phigros/releases/3.19.4-deadbeef/avatars/Cipher1.png?v=3.19.4-deadbeef',
    );
  });

  it('encodes an avatar name that is already the published file name', async () => {
    await expect(resolvePhigrosAvatarUrl('A+B#?')).resolves.toBe(
      'https://rranker-phigros-data.cn-nb1.rains3.com/phigros/releases/3.19.4-deadbeef/avatars/A%2BB%23%3F.png?v=3.19.4-deadbeef',
    );
  });

  it('lists each published avatar once in alphabetical order', async () => {
    release.avatarAliases += 'Cipher alias\tCipher1\ninvalid\n';
    await expect(loadPhigrosAvatarCatalog()).resolves.toEqual(['Cipher1', 'Glaciaxion']);
  });

  it('uses the new aliases and directory when the resource release changes', async () => {
    await resolvePhigrosAvatarUrl('Cipher : /2&//<|0');
    vi.mocked(phigrosResources.load).mockResolvedValue({
      ...release, revision: `${release.revision}-new`, avatarAliases: 'Cipher : /2&//<|0\tCipher2\n',
      current: { ...release.current, manifest: 'phigros/releases/new/manifest.json', resourceVersion: 'new' },
    });
    await expect(resolvePhigrosAvatarUrl('Cipher : /2&//<|0')).resolves.toBe(
      'https://rranker-phigros-data.cn-nb1.rains3.com/phigros/releases/new/avatars/Cipher2.png?v=new',
    );
  });

  it('returns no avatar when the current release is unavailable', async () => {
    vi.mocked(phigrosResources.load).mockRejectedValue(new Error('unavailable'));
    await expect(resolvePhigrosAvatarUrl('Cipher1')).resolves.toBeNull();
    await expect(loadPhigrosAvatarCatalog()).rejects.toThrow('unavailable');
  });

  it('preserves cancellation', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);
    await expect(resolvePhigrosAvatarUrl('Cipher1', controller.signal)).rejects.toBe(reason);
  });
});

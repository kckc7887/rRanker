import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizePhigrosAvatarKey,
  resetPhigrosAvatarAliasCacheForTests,
  resolvePhigrosAvatarFileName,
  resolvePhigrosAvatarUrl,
} from '@/domain/phigros-avatar-resolver';

describe('phigros avatar resolver', () => {
  afterEach(() => {
    resetPhigrosAvatarAliasCacheForTests();
    vi.unstubAllGlobals();
  });

  it('normalizePhigrosAvatarKey strips avatar. prefix', () => {
    expect(normalizePhigrosAvatarKey('avatar.Glaciaxion')).toBe('Glaciaxion');
    expect(normalizePhigrosAvatarKey(' Glaciaxion ')).toBe('Glaciaxion');
  });

  it('resolvePhigrosAvatarFileName maps display and internal keys to OSS filename', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      'Cipher : /2&//<|0\tCipher1\nGlaciaxion\tGlaciaxion\n',
      { status: 200 },
    )));

    await expect(resolvePhigrosAvatarFileName('3.19.4', 'Cipher1')).resolves.toBe('Cipher1');
    await expect(resolvePhigrosAvatarFileName('3.19.4', 'Cipher : /2&//<|0')).resolves.toBe('Cipher1');
    await expect(resolvePhigrosAvatarFileName('3.19.4', 'Glaciaxion')).resolves.toBe('Glaciaxion');
  });

  it('resolvePhigrosAvatarUrl builds encoded OSS avatar path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      'Cipher : /2&//<|0\tCipher1\n',
      { status: 200 },
    )));

    await expect(resolvePhigrosAvatarUrl('3.19.4', 'Cipher1')).resolves.toBe(
      'https://rranker-phigros-data.cn-nb1.rains3.com/phigros/releases/3.19.4/avatars/Cipher1.png',
    );
  });

  it('resolvePhigrosAvatarUrl builds direct name when display equals OSS key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      'Glaciaxion\tGlaciaxion\n',
      { status: 200 },
    )));

    await expect(resolvePhigrosAvatarUrl('3.19.4', 'Glaciaxion')).resolves.toBe(
      'https://rranker-phigros-data.cn-nb1.rains3.com/phigros/releases/3.19.4/avatars/Glaciaxion.png',
    );
  });
});

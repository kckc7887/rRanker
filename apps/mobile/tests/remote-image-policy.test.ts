import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ image: Object.assign(() => null, { clearDiskCache: vi.fn() }) }));
vi.mock('expo-image', () => ({ Image: mocks.image }));
vi.mock('@/services/remote-image-cache', () => ({
  invalidateCompressedRemoteImage: vi.fn(),
  loadCompressedRemoteImage: vi.fn(),
  normalizeRemoteImageSource: vi.fn(() => null),
  supportsCompressedRemoteImageCache: vi.fn(() => true),
}));

// expo-image mock 完成后导入，验证公共组件对真实能力组件设置内存默认值。
// eslint-disable-next-line import/first
import { resolveRemoteImageCacheMode } from '@/components/RemoteImage';

describe('RemoteImage cache policy', () => {
  it('uses the native disk fallback unless a compressed profile is explicit', () => {
    expect(resolveRemoteImageCacheMode(undefined, undefined)).toBe('native');
    expect(resolveRemoteImageCacheMode(undefined, 'disk')).toBe('native');
  });

  it('preserves the two shared compressed profiles', () => {
    expect(resolveRemoteImageCacheMode('thumbnail', undefined)).toBe('thumbnail');
    expect(resolveRemoteImageCacheMode('artwork', undefined)).toBe('artwork');
  });

  it('lets an explicit none policy through for one-off preview images', () => {
    expect(resolveRemoteImageCacheMode(undefined, 'none')).toBe('none');
    expect(resolveRemoteImageCacheMode('none', 'disk')).toBe('none');
  });
});

describe('song cover call path', () => {
  const source = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');

  it('assigns shared song rows and score cards to their presentation game', () => {
    expect(source('src/components/game-content/GameSongRow.tsx')).toMatch(
      /cacheProfile="thumbnail"[\s\S]*?gameId=\{presentation\.gameId\}/u,
    );
    expect(source('src/components/game-content/GameScoreCard.tsx')).toContain(
      "{ cacheProfile: 'thumbnail' as const, gameId: presentation.gameId }",
    );
  });

  it('routes score-image jackets through the shared compressed loader', () => {
    expect(source('src/features/best-image/load-best-image-jackets.ts')).toContain(
      "{ gameId: 'maimai', profile: 'thumbnail' }",
    );
    expect(source('src/features/chunithm-best-image/load-chunithm-best-image-jackets.ts')).toContain(
      "{ gameId: 'chunithm', profile: 'thumbnail' }",
    );
    const phigrosLoader = source('src/features/phigros-best-image/load-phigros-image-assets.ts');
    expect(phigrosLoader).toContain("{ gameId: 'phigros', profile: 'artwork' }");
    expect(phigrosLoader).toContain('else if (!cacheOptions) await File.downloadFileAsync');
    expect(phigrosLoader).toContain('else return null');
  });

  it('keeps compressed-cover fallbacks out of native disk cache', () => {
    const remoteImage = source('src/components/RemoteImage.tsx');
    expect(remoteImage).toContain('return <Image {...props} cachePolicy="memory"');
    expect(remoteImage).toContain("fallback ? 'memory' : 'memory-disk'");
    expect(source('src/screens/ChunithmBestImageScreen.tsx')).not.toContain(
      'chunithmBestImageJacketUrl(String(backgroundSong.id))',
    );
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ image: Object.assign(() => null, { clearDiskCache: vi.fn() }) }));
vi.mock('expo-image', () => ({ Image: mocks.image }));
vi.mock('@/services/remote-image-cache', () => ({
  cacheCompressedRemoteImage: vi.fn(),
  findCompressedRemoteImage: vi.fn(),
  invalidateCompressedRemoteImage: vi.fn(),
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

  it('keeps score-image jackets in task-scoped temporary files', () => {
    expect(source('src/features/best-image/load-best-image-jackets.ts')).not.toContain('profile:');
    expect(source('src/features/chunithm-best-image/load-chunithm-best-image-jackets.ts')).not.toContain('profile:');
    const phigrosLoader = source('src/features/phigros-best-image/load-phigros-image-assets.ts');
    expect(phigrosLoader).not.toContain('loadCompressedRemoteImage');
    expect(phigrosLoader).toContain('await File.downloadFileAsync(url, staged');
    expect(phigrosLoader).toContain('disposedDirectories.has(directory.uri) && staged.exists');
  });

  it('keeps compressed-cover fallbacks out of native disk cache', () => {
    const remoteImage = source('src/components/RemoteImage.tsx');
    expect(remoteImage).toContain('return <Image {...props} cachePolicy="memory"');
    expect(remoteImage).toContain("cachePolicy={showingRemote ? 'memory' : 'none'}");
    expect(remoteImage).toContain('RemoteImagePersistenceContext');
    const listPages = source('src/components/game-content/GameListPages.tsx');
    expect(listPages).toContain('itemVisiblePercentThreshold: 50');
    expect(listPages).toContain('minimumViewTime: 250');
    expect(source('app/_layout.tsx')).toContain(
      "<RemoteImageActivityScope active={lifecycle.phase !== 'background'}>",
    );
    expect(source('src/screens/ChunithmBestImageScreen.tsx')).not.toContain(
      'chunithmBestImageJacketUrl(String(backgroundSong.id))',
    );
    expect(source('src/features/chunithm-best-image/chunithm-best-image-background-picker.tsx'))
      .toContain('cacheProfile="none"');
  });

  it('pauses bulk detail queries while their cached tab is inactive', () => {
    expect(source('src/hooks/use-muse-dash.ts')).toContain(
      'enabled: enabled && tabActive && userId !== null',
    );
    expect(source('src/hooks/use-osu-beatmapsets-by-ids.ts')).toContain(
      'enabled: bound && tabActive',
    );
  });
});

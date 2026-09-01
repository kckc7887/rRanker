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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBestImageAssets } from '@/features/best-image/load-best-image-assets';

const mocks = vi.hoisted(() => ({
  loadAsync: vi.fn(),
  base64: vi.fn(),
}));

vi.mock('expo-asset', () => ({
  Asset: { loadAsync: mocks.loadAsync },
}));
vi.mock('expo-file-system', () => ({
  File: class MockFile {
    constructor(public readonly uri: string) {}
    base64() { return mocks.base64(this.uri); }
  },
}));

describe('best image embedded assets', () => {
  beforeEach(() => {
    mocks.loadAsync.mockImplementation(async (moduleId: number) => [{
      localUri: `file:///asset-${moduleId}`,
      uri: `https://fallback.invalid/${moduleId}`,
    }]);
    mocks.base64.mockImplementation(async (uri: string) => `encoded-${uri.split('-').at(-1)}`);
  });

  it('loads bundled files and exposes WebView-safe data URIs', async () => {
    await expect(loadBestImageAssets(901, 902)).resolves.toEqual({
      fontUrl: 'data:font/ttf;base64,encoded-901',
      ratingFrameUrl: 'data:image/png;base64,encoded-902',
    });
    expect(mocks.loadAsync).toHaveBeenCalledWith(901);
    expect(mocks.loadAsync).toHaveBeenCalledWith(902);
    expect(mocks.base64).toHaveBeenCalledWith('file:///asset-901');
    expect(mocks.base64).toHaveBeenCalledWith('file:///asset-902');
  });
});

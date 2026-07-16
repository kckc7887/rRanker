import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBestImageAssets } from '@/features/best-image/load-best-image-assets';

const mocks = vi.hoisted(() => ({
  loadAsync: vi.fn(),
  base64: vi.fn(),
  resolveAssetSource: vi.fn(),
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
vi.mock('react-native', () => ({
  Image: { resolveAssetSource: mocks.resolveAssetSource },
}));

describe('best image embedded assets', () => {
  beforeEach(() => {
    mocks.loadAsync.mockImplementation(async (moduleId: number) => [{
      localUri: `file:///asset-${moduleId}`,
      uri: `https://fallback.invalid/${moduleId}`,
    }]);
    mocks.base64.mockImplementation(async (uri: string) => `encoded-${uri.split('-').at(-1)}`);
    mocks.resolveAssetSource.mockImplementation((moduleId: number) => ({
      uri: `rating_asset_${moduleId}`,
    }));
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
    expect(mocks.resolveAssetSource).not.toHaveBeenCalled();
  });

  it('copies Android release resource identifiers to readable cache files', async () => {
    mocks.loadAsync.mockImplementation(async (source: number | string) => {
      if (typeof source === 'string') {
        return [{ localUri: `file:///cache/${source}`, uri: source }];
      }
      if (source === 911) throw new Error('raw resource path is not directly readable');
      return [{ localUri: `rating_asset_${source}`, uri: `rating_asset_${source}` }];
    });
    mocks.base64.mockImplementation(async (uri: string) => {
      if (!uri.startsWith('file:///')) throw new Error('not a file URI');
      return `encoded-${uri.split('/').at(-1)}`;
    });

    await expect(loadBestImageAssets(911, 912)).resolves.toEqual({
      fontUrl: 'data:font/ttf;base64,encoded-rating_asset_911',
      ratingFrameUrl: 'data:image/png;base64,encoded-rating_asset_912',
    });
    expect(mocks.resolveAssetSource).toHaveBeenCalledWith(911);
    expect(mocks.resolveAssetSource).toHaveBeenCalledWith(912);
    expect(mocks.loadAsync).toHaveBeenCalledWith('rating_asset_911');
    expect(mocks.loadAsync).toHaveBeenCalledWith('rating_asset_912');
    expect(mocks.base64).toHaveBeenCalledWith('file:///cache/rating_asset_911');
    expect(mocks.base64).toHaveBeenCalledWith('file:///cache/rating_asset_912');
  });
});

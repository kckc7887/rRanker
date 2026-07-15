/* eslint-disable import/first -- Vitest native-module mocks must be registered before imports. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-media-library', () => ({
  isAvailableAsync: vi.fn(async () => true),
  requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
  saveToLibraryAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-file-system', () => {
  const fileStates = new Map<string, boolean>();
  class File {
    readonly uri: string;

    constructor(first: string, second?: string) {
      this.uri = second ? `${first}/${second}` : first;
    }

    get exists() {
      return fileStates.get(this.uri) ?? this.uri.includes('capture');
    }

    copy(output: File) {
      fileStates.set(output.uri, true);
    }

    delete() {
      fileStates.set(this.uri, false);
    }
  }
  return { File, Paths: { cache: 'file:///cache' }, __fileStates: fileStates };
});

import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import {
  bestImageCaptureDimensions,
  bestImageExportFilename,
  deleteBestImageCapture,
  isDrawViewHierarchyError,
  requestBestImageExportPermission,
  saveBestImageCapture,
  shouldUseBestImageRenderInContext,
} from '@/features/best-image/best-image-export';

describe('best image export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates sanitized and page-aware PNG filenames', () => {
    const now = new Date('2026-07-16T08:09:10.123Z');
    expect(bestImageExportFilename('玩家/A', 'custom', 1, 3, now))
      .toBe('rRanker-玩家_A-custom-20260716T080910Z-2of3.png');
    expect(bestImageExportFilename('玩家', 'best50', 0, 1, now))
      .toBe('rRanker-玩家-best50-20260716T080910Z.png');
  });

  it('uses logical points on iOS and physical pixels on Android', () => {
    expect(bestImageCaptureDimensions(2160, 8640, 3, 'ios')).toEqual({ width: 720, height: 2880 });
    expect(bestImageCaptureDimensions(2160, 8640, 3, 'android')).toEqual({ width: 2160, height: 8640 });
    expect(bestImageCaptureDimensions(1080, 1440, 0, 'ios')).toEqual({ width: 1080, height: 1440 });
  });

  it('selects the large-view iOS renderer and recognizes its native error', () => {
    expect(shouldUseBestImageRenderInContext('ios', 1440, 1920)).toBe(true);
    expect(shouldUseBestImageRenderInContext('ios', 1080, 5000)).toBe(true);
    expect(shouldUseBestImageRenderInContext('ios', 1080, 1440)).toBe(false);
    expect(shouldUseBestImageRenderInContext('android', 2160, 10000)).toBe(false);
    expect(isDrawViewHierarchyError(new Error('The view cannot be captured. drawViewHierarchyInRect was not successful.'))).toBe(true);
  });

  it('reports denied gallery permission clearly', async () => {
    vi.mocked(MediaLibrary.requestPermissionsAsync).mockResolvedValueOnce({ granted: false } as never);
    await expect(requestBestImageExportPermission()).rejects.toThrow('没有相册写入权限');
  });

  it('copies a capture to a named cache file, saves it, and cleans both files', async () => {
    const states = (FileSystem as unknown as { __fileStates: Map<string, boolean> }).__fileStates;
    await saveBestImageCapture('file:///capture.png', 'result.png');
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///cache/result.png');
    expect(states.get('file:///cache/result.png')).toBe(false);

    deleteBestImageCapture('file:///capture.png');
    expect(states.get('file:///capture.png')).toBe(false);
  });
});

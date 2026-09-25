import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { rizlineCatalog, rizlineCatalogAssetFiles } from './fixtures/rizline';
import {
  createRizlineChartPreviewResourceLoader,
  type RizlineChartPreviewResourcePort,
} from '@/services/rizline-chart-preview-resources';
import type { RizlineRelease } from '@/services/rizline-resources';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const CHART_BYTES = Uint8Array.from([1, 2, 3]);
const MUSIC_BYTES = Uint8Array.from([4, 5, 6, 7]);

function release(): RizlineRelease {
  const snapshot = rizlineCatalog();
  return {
    snapshot,
    source: { kind: 'rizline', label: 'Rizline 曲库', updatedAt: '2026-09-20T00:00:00.000Z', isStale: false },
    files: [
      { path: 'rizline/releases/r1/catalog.json', size: 1, sha256: 'a'.repeat(64) },
      ...rizlineCatalogAssetFiles(snapshot).map((file) => {
        if (file.path.endsWith('/charts/Song.A.0.IN.json')) {
          return { ...file, size: CHART_BYTES.byteLength, sha256: hash(CHART_BYTES) };
        }
        if (file.path.endsWith('/audio/Song.A.0.m4a')) {
          return { ...file, size: MUSIC_BYTES.byteLength, sha256: hash(MUSIC_BYTES) };
        }
        return { ...file, sha256: 'a'.repeat(64) };
      }),
    ],
  };
}

function port(
  overrides: Partial<Omit<RizlineChartPreviewResourcePort, never>> = {},
): RizlineChartPreviewResourcePort {
  const current = release();
  return {
    withRelease: async (action) => action(current),
    readBytes: async (asset) => (asset.path.endsWith('.json') ? CHART_BYTES : MUSIC_BYTES),
    ...overrides,
  };
}

describe('Rizline 谱面确认资源准备端口', () => {
  it('只用端口即可完成定位、读取与校验，不需要平台或网络模块替换', async () => {
    const readBytes = vi.fn(async (asset: { path: string }, _index: number) => (
      asset.path.endsWith('.json') ? CHART_BYTES : MUSIC_BYTES
    ));
    const load = createRizlineChartPreviewResourceLoader(port({ readBytes }));

    await expect(load({ songId: 'Song.A.0', levelIndex: 2 }, new AbortController().signal)).resolves.toMatchObject({
      chart: { difficulty: 'IN', path: 'rizline/releases/r1/charts/Song.A.0.IN.json' },
      music: { path: 'rizline/releases/r1/audio/Song.A.0.m4a' },
    });
    expect(readBytes).toHaveBeenCalledTimes(2);
    expect(readBytes.mock.calls.map((call) => call[1])).toEqual([0, 1]);
  });

  it('资源完整性校验失败时按谱面、音频分别报错', async () => {
    const load = createRizlineChartPreviewResourceLoader(port({ readBytes: async () => Uint8Array.from([9]) }));
    await expect(load({ songId: 'Song.A.0', levelIndex: 2 }, new AbortController().signal))
      .rejects.toThrow('Rizline 谱面校验失败');

    let call = 0;
    const loadSecond = createRizlineChartPreviewResourceLoader(port({
      readBytes: async () => { call += 1; return call === 1 ? CHART_BYTES : Uint8Array.from([9]); },
    }));
    await expect(loadSecond({ songId: 'Song.A.0', levelIndex: 2 }, new AbortController().signal))
      .rejects.toThrow('Rizline 音频校验失败');
  });

  it('读取完成后发现取消则抛出调用方的取消原因', async () => {
    const controller = new AbortController();
    const load = createRizlineChartPreviewResourceLoader(port({
      readBytes: async () => { controller.abort(new Error('已取消')); return CHART_BYTES; },
    }));
    await expect(load({ songId: 'Song.A.0', levelIndex: 2 }, controller.signal)).rejects.toThrow('已取消');
  });

  it('调用方提供的读取函数覆盖端口默认读取', async () => {
    const readBytes = vi.fn(async () => CHART_BYTES);
    const read = vi.fn(async () => MUSIC_BYTES);
    const load = createRizlineChartPreviewResourceLoader(port({ readBytes }));
    await expect(load({ songId: 'Song.A.0', levelIndex: 2 }, new AbortController().signal, read))
      .rejects.toThrow('Rizline 谱面校验失败');
    expect(read).toHaveBeenCalledTimes(1);
    expect(readBytes).not.toHaveBeenCalled();
  });
});

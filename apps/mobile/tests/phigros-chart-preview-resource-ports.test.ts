import { describe, expect, it, vi } from 'vitest';
import { releaseFixture } from './fixtures/phigros-release';
import {
  createPhigrosChartPreviewResourceLoader,
  type PhigrosChartPreviewResourceKind,
  type PhigrosChartPreviewResourcePort,
} from '@/services/phigros-chart-preview-resources';
import type { PhigrosRelease } from '@/services/phigros-resources';

const SONG_ID = 'Song.A';
const fixture = releaseFixture('9.9.9-test', [SONG_ID], { variants: [2, 5] });

const release: PhigrosRelease = {
  current: { ...fixture.current, schemaVersion: 1 },
  manifest: fixture.manifest as PhigrosRelease['manifest'],
  catalog: {
    songCount: 1,
    songs: [{
      id: SONG_ID, title: 'Song A', composer: 'Artist', illustrator: 'I',
      charters: ['e'], difficulties: [1],
    }],
  },
  noteCounts: '',
  difficulty: '',
  avatarAliases: '',
  revision: '9.9.9-test',
  fetchedAt: '2026-09-20T00:00:00.000Z',
  bypass: undefined,
};

const CHART_PATH = `charts/${SONG_ID}.0/EZ.json`;
const MUSIC_PATH = `music/${SONG_ID}.ogg`;
const ILLUSTRATION_PATH = `illustrations/${SONG_ID}.png`;
const bytesOf = (path: string) => fixture.files[path]!;

function port(
  overrides: Partial<Omit<PhigrosChartPreviewResourcePort, 'ossBase'>> = {},
): PhigrosChartPreviewResourcePort {
  return {
    ossBase: 'https://assets.example',
    withRelease: async (action) => action(release),
    resolveAssetUrl: (_release, path) => `https://assets.example/${path}?v=9.9.9-test`,
    readBytes: async (url) => {
      if (url.includes('/music/')) return bytesOf(MUSIC_PATH);
      if (url.includes('/illustrations')) return bytesOf(ILLUSTRATION_PATH);
      return bytesOf(CHART_PATH);
    },
    ...overrides,
  };
}

describe('Phigros 谱面确认资源准备端口', () => {
  it('只用端口即可读取并校验谱面、音乐与曲绘', async () => {
    const readBytes = vi.fn(async (url: string, _signal?: AbortSignal, _kind?: PhigrosChartPreviewResourceKind) => {
      if (url.includes('/music/')) return bytesOf(MUSIC_PATH);
      if (url.includes('/illustrations')) return bytesOf(ILLUSTRATION_PATH);
      return bytesOf(CHART_PATH);
    });
    const loader = createPhigrosChartPreviewResourceLoader(port({ readBytes }));

    const result = await loader.load({ songId: SONG_ID, difficulty: 'EZ' }, new AbortController().signal);

    expect(result.bundle.chart.path).toBe(CHART_PATH);
    expect(result.chart).toEqual(bytesOf(CHART_PATH));
    expect(result.music).toEqual(bytesOf(MUSIC_PATH));
    expect(result.illustration).toEqual(bytesOf(ILLUSTRATION_PATH));
    expect(readBytes.mock.calls.map((call) => call[2])).toEqual(['chart', 'music', 'illustration']);
  });

  it('变体编号从发布清单纯计算得出', async () => {
    const loader = createPhigrosChartPreviewResourceLoader(port());
    await expect(loader.loadVariants({ songId: SONG_ID, difficulty: 'EZ' }, new AbortController().signal))
      .resolves.toEqual([0, 2, 5]);
  });

  it('字节与发布清单不一致时按资源校验失败报错', async () => {
    const loader = createPhigrosChartPreviewResourceLoader(port({
      readBytes: async () => new Uint8Array([1, 2, 3]),
    }));
    await expect(loader.load({ songId: SONG_ID, difficulty: 'EZ' }, new AbortController().signal))
      .rejects.toThrow('Phigros 资源校验失败');
  });

  it('读取后取消则抛出调用方的取消原因', async () => {
    const controller = new AbortController();
    const loader = createPhigrosChartPreviewResourceLoader(port({
      readBytes: async (url) => {
        controller.abort(new Error('已取消'));
        return url.includes('/music/') ? bytesOf(MUSIC_PATH) : bytesOf(CHART_PATH);
      },
    }));
    await expect(loader.load({ songId: SONG_ID, difficulty: 'EZ' }, controller.signal)).rejects.toThrow('已取消');
  });
});

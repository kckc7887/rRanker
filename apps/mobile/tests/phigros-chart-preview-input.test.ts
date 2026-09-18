import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  buildPhigrosChartPreviewInput,
  buildPhiraChartPreviewInput,
} from '@/features/phigros-chart-preview/chart-preview-input';
import { loadPhigrosChartPreviewResources } from '@/domain/phigros-chart-preview';

vi.mock('@/domain/phigros-chart-preview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domain/phigros-chart-preview')>();
  return {
    ...actual,
    loadPhigrosChartPreviewResources: vi.fn(),
  };
});

vi.mock('@/providers/phira-provider', () => ({
  phiraProvider: {
    getChart: async () => ({
      id: 38294,
      name: '测试谱面',
      illustration: null,
      file: 'https://phira.example/chart.zip',
    }),
    downloadChart: () => {
      throw new Error('should use injected downloadChart');
    },
  },
}));

const loadResources = vi.mocked(loadPhigrosChartPreviewResources);

describe('chart preview input resource injection', () => {
  it('forwards a custom Phigros reader into loadPhigrosChartPreviewResources', async () => {
    const read = vi.fn(async () => new Uint8Array([1]));
    loadResources.mockImplementation(async (_target, _signal, customRead) => {
      expect(customRead).toBe(read);
      await customRead?.(
        { path: 'c', url: 'https://c', size: 2, sha256: 'a', contentType: 'application/json' },
        0,
      );
      return {
        bundle: {
          song: { title: 'Song' },
          target: { difficulty: 'AT' },
          illustration: { contentType: 'image/png' },
        },
        chart: new Uint8Array([123, 125]),
        music: new Uint8Array([1, 2, 3]),
        illustration: new Uint8Array([4, 5]),
      } as Awaited<ReturnType<typeof loadPhigrosChartPreviewResources>>;
    });

    const prepared = await buildPhigrosChartPreviewInput(
      { songId: 'Song.Id', levelIndex: 3, title: 'Song AT' },
      {},
      new AbortController().signal,
      read,
    );

    expect(read).toHaveBeenCalledTimes(1);
    expect(prepared.config.chartText).toBe('{}');
    expect(prepared.musicDataBase64).toBe(Buffer.from([1, 2, 3]).toString('base64'));
  });

  it('uses injected Phira zip download instead of the provider arrayBuffer path', async () => {
    const zip = new JSZip();
    zip.file('info.yml', 'chart: chart.json\nmusic: song.mp3\nformat: pgr');
    zip.file('chart.json', JSON.stringify({ formatVersion: 3, offset: 0, judgeLineList: [] }));
    zip.file('song.mp3', new Uint8Array([1, 2, 3, 4]));
    const zipData = await zip.generateAsync({ type: 'arraybuffer' });
    const downloadChart = vi.fn(async () => zipData);
    const stageMusic = vi.fn(async (bytes: Uint8Array, fileName: string) => ({
      uri: `file:///${fileName}`,
      base64: Buffer.from(bytes).toString('base64'),
    }));

    const prepared = await buildPhiraChartPreviewInput(
      { chartId: 38294, title: '测试谱面' },
      {},
      new AbortController().signal,
      {
        downloadChart,
        stageMusic,
        stageRpeBundle: async () => ({ basePath: './rpe/38294/' }),
      },
    );

    expect(downloadChart).toHaveBeenCalledWith('https://phira.example/chart.zip', expect.any(AbortSignal));
    expect(stageMusic).toHaveBeenCalledTimes(1);
    expect(prepared.config.chartText).toContain('"formatVersion"');
    expect(prepared.musicDataBase64).toBe(Buffer.from([1, 2, 3, 4]).toString('base64'));
  });
});

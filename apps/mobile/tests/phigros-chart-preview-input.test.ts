import { crc32 } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  buildPhigrosChartPreviewInput,
  buildPhiraChartPreviewInput,
  CHART_TEXT_LIMIT,
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

function storedZip(files: readonly { name: string; data: Buffer; uncompressedSize?: number }[]): ArrayBuffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const uncompressedSize = file.uncompressedSize ?? file.data.length;
    const checksum = file.data.length === 0 ? 0 : crc32(file.data);
    const local = Buffer.alloc(30 + name.length + file.data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    file.data.copy(local, 30 + name.length);
    locals.push(local);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Uint8Array.from(Buffer.concat([...locals, centralDirectory, eocd])).buffer;
}

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

  it('rejects an oversized chart from its declared size before staging', async () => {
    const zipData = storedZip([
      { name: 'info.yml', data: Buffer.from('chart: chart.json\nmusic: song.mp3\nformat: pgr') },
      { name: 'song.mp3', data: Buffer.from([1, 2, 3, 4]) },
      { name: 'chart.json', data: Buffer.alloc(0), uncompressedSize: CHART_TEXT_LIMIT + 1 },
    ]);
    const stageMusic = vi.fn(async () => ({ uri: 'file:///music.mp3', base64: 'AQ==' }));
    const stageRpeBundle = vi.fn(async () => ({ basePath: './rpe/38294/' }));
    await expect(buildPhiraChartPreviewInput(
      { chartId: 38294 },
      {},
      new AbortController().signal,
      { downloadChart: async () => zipData, stageMusic, stageRpeBundle },
    )).rejects.toThrow('谱面过大，暂不支持预览');
    expect(stageMusic).not.toHaveBeenCalled();
    expect(stageRpeBundle).not.toHaveBeenCalled();
  });
});

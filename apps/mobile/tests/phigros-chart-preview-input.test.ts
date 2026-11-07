import { crc32 } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { buildPhigrosChartPreviewInput } from '@/features/phigros-chart-preview/chart-preview-input';
import { buildPhiraChartPreviewInput, RPE_CHART_TEXT_LIMIT } from '@/features/phira-chart-preview/chart-preview-input';
import { loadPhigrosChartPreviewResources } from '@/services/phigros-chart-preview-resources';

vi.mock('@/services/phigros-chart-preview-resources', () => ({
  loadPhigrosChartPreviewResources: vi.fn(),
}));

vi.mock('@/providers/phira-provider', () => ({
  phiraProvider: {
    getChart: async () => ({
      id: 38294,
      name: '测试谱面',
      illustration: null,
      file: 'https://phira.example/chart.zip',
    }),
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
  it('prepares Phigros chart text, music and illustration data', async () => {
    const read = vi.fn(async () => new Uint8Array([1]));
    loadResources.mockImplementation(async () => {
      return {
        bundle: {
          song: { title: 'Song', difficultyConstant: 16.4 },
          target: { difficulty: 'AT' },
          illustration: { contentType: 'image/png' },
        },
        chart: new TextEncoder().encode('{"formatVersion":3,"judgeLineList":[]}'),
        music: new Uint8Array([1, 2, 3]),
        illustration: new Uint8Array([4, 5]),
      } as Awaited<ReturnType<typeof loadPhigrosChartPreviewResources>>;
    });

    const prepared = await buildPhigrosChartPreviewInput(
      { songId: 'Song.Id', levelIndex: 3, title: 'Song', variantIndex: 1 },
      {},
      new AbortController().signal,
      read,
    );

    expect(prepared.config.format).toBe('pgr');
    expect(prepared.config.title).toBe('Song');
    expect(prepared.config.previewDifficulty).toMatchObject({ label: 'AT', value: '16.4', identity: '里谱 1' });
    expect(prepared.config.illustrationUrl).toBe('data:image/png;base64,BAU=');
    expect(prepared.musicDataBase64).toBe(Buffer.from([1, 2, 3]).toString('base64'));
  });

  it('prepares a downloaded Phira chart and stages its music', async () => {
    const zip = new JSZip();
    zip.file('info.yml', 'chart: chart.pec\nmusic: song.mp3\nformat: rpe');
    zip.file('chart.pec', JSON.stringify({ formatVersion: 3, offset: 0, judgeLineList: [] }));
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
    expect(prepared.config.format).toBe('pgr');
    expect(JSON.parse(prepared.config.chartText)).toMatchObject({ formatVersion: 3 });
    expect(prepared.musicDataBase64).toBe(Buffer.from([1, 2, 3, 4]).toString('base64'));
  });

  it('rejects an oversized chart from its declared size before staging', async () => {
    const zipData = storedZip([
      { name: 'info.yml', data: Buffer.from('chart: chart.json\nmusic: song.mp3\nformat: pgr') },
      { name: 'song.mp3', data: Buffer.from([1, 2, 3, 4]) },
      { name: 'chart.json', data: Buffer.alloc(0), uncompressedSize: RPE_CHART_TEXT_LIMIT + 1 },
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

  it('stages images referenced by animated RPE shader variables with the chart media', async () => {
    const zip = new JSZip();
    zip.file('info.yml', 'chart: chart.json\nmusic: song.mp3');
    zip.file('chart.json', JSON.stringify({ META: { RPEVersion: 160, background: 'cover.png' },
      BPMList: [{ startTime: [0, 0, 1], bpm: 120 }], judgeLineList: [{ Texture: 'line.gif', notes: [] }] }));
    zip.file('song.mp3', new Uint8Array([1]));
    zip.file('extra.json', JSON.stringify({ videos: [{ path: 'clip.mp4', time: [0, 0, 1] }],
      effects: [{ shader: 'mix.fs', vars: { image: [
        { startTime: [0, 0, 1], endTime: [2, 0, 1], start: '/图/红.png', end: '/图/蓝.png' },
      ], color: [255, 128, 64, 255] } }] }));
    zip.file('mix.fs', 'uniform sampler2D image;');
    const images = ['cover.png', 'line.gif', 'clip.mp4', '图/红.png', '图/蓝.png'];
    images.forEach((name, index) => zip.file(name, new Uint8Array([index + 1])));
    zip.file('unused.png', new Uint8Array([99]));
    const zipData = await zip.generateAsync({ type: 'arraybuffer' });
    const staged = new Map<string, Uint8Array>();
    const prepared = await buildPhiraChartPreviewInput({ chartId: 38294 }, {}, new AbortController().signal, {
      downloadChart: async () => zipData,
      stageMusic: async () => ({ uri: 'file:///song.mp3', base64: 'AQ==' }),
      stageRpeBundle: async (_id, files) => {
        for (const file of files) staged.set(file.name, file.bytes);
        return { basePath: './rpe/38294/' };
      },
    });
    images.forEach((name, index) => expect(staged.get(name)).toEqual(new Uint8Array([index + 1])));
    expect(staged.has('unused.png')).toBe(false);
    expect(prepared.config.rpeAssets?.shaders).toEqual({ 'mix.fs': 'uniform sampler2D image;' });
  });
});

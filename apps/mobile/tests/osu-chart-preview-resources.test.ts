import { crc32 } from 'node:zlib';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import {
  CHART_PREVIEW_MAX_ARCHIVE_ENTRIES,
  CHART_PREVIEW_MAX_ENTRY_UNCOMPRESSED_BYTES,
} from '@/features/chart-preview-shared/chart-preview-resource-budget';
import { readOsuChartPreviewArchive } from '@/features/osu-chart-preview/chart-preview-resources';
import {
  normalizeOsuChartPreviewSettings,
  parseOsuChartPreviewTarget,
  type OsuChartPreviewTarget,
} from '@/features/osu-chart-preview/configuration';
import { applyOsuChartPreviewConfigToHtml, buildOsuChartPreviewAudioScript } from '@/features/osu-chart-preview/osu-chart-preview-inject';
import { captureResourceWrites, invalidateResourceWrites } from '@/services/snapshot-cache-utils';

const target: OsuChartPreviewTarget = { gameId: 'osu-catch', beatmapsetId: 10, beatmapId: 21 };
const osu = (id = 21, set = 10) => `osu file format v14
[General]
AudioFilename: music.ogg
Mode: 0
[Metadata]
Title: Selected
Version: Selected
BeatmapID: ${id}
BeatmapSetID: ${set}
[Difficulty]
CircleSize: 4
OverallDifficulty: 5
ApproachRate: 5
SliderMultiplier: 1.4
SliderTickRate: 1
[Events]
0,0,"bg.PNG",0,0
Video,0,"movie.mp4"
[TimingPoints]
0,500,4,1,0,100,1,0
[HitObjects]
256,192,1000,1,0,0:0:0:0:
`;

async function archive(extra?: (zip: JSZip) => void) {
  const zip = new JSZip();
  zip.file('set/selected.osu', osu());
  zip.file('set/other.osu', osu(22));
  zip.file('set/music.ogg', Uint8Array.from([1, 2, 3]));
  zip.file('set/BG.png', Uint8Array.from([4, 5]));
  zip.file('set/movie.mp4', Uint8Array.from([6, 7, 8]));
  zip.file('set/unrelated.mp3', Uint8Array.from([9, 10]));
  zip.file('other/ignored.osb', '[Events]\nSprite,Background,Centre,"unrelated.png",0,0');
  extra?.(zip);
  return zip.generateAsync({ type: 'uint8array' });
}

function storedZip(files: readonly { name: string; data: Buffer; uncompressedSize?: number }[]): Uint8Array {
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
  return Uint8Array.from(Buffer.concat([...locals, centralDirectory, eocd]));
}

const reader = () => ({
  assertCurrent: vi.fn(),
  stageMedia: vi.fn(async (path: string, _bytes: Uint8Array) => `file:///session/${encodeURIComponent(path)}`),
  onProgress: vi.fn(),
});

describe('osu 谱面确认资源选择', () => {
  it.each(['le', 'be'])('保留 UTF16%s 编码的谱面与故事板', async (endian) => {
    const encode = (value: string): Uint8Array => {
      const bytes = Buffer.from(`\uFEFF${value}`, 'utf16le');
      return Uint8Array.from(endian === 'be' ? bytes.swap16() : bytes);
    };
    const bytes = await archive((zip) => {
      zip.file('set/selected.osu', encode(osu()));
      zip.file('set/selected.osb', encode('[Events]\nSprite,Background,Centre,"BG.png",0,0'));
    });
    const result = await readOsuChartPreviewArchive(bytes, target, reader());
    expect(result.chartPath).toBe('set/selected.osu');
    expect(result.files.find((file) => file.path === 'set/selected.osb')?.text).toContain('Sprite,Background');
    expect(result.files.find((file) => file.path === 'set/BG.png')?.uri).toBeDefined();
  });

  it('精确选择当前难度，音频注入字节而图片视频使用本地地址', async () => {
    const io = reader();
    const result = await readOsuChartPreviewArchive(await archive(), target, io);
    expect(result.chartPath).toBe('set/selected.osu');
    expect(result.files.filter((file) => file.text).map((file) => file.path)).toEqual(['set/selected.osu']);
    expect(result.audio['set/music.ogg']).toBe('AQID');
    expect(result.audio['set/unrelated.mp3']).toBeUndefined();
    expect(result.audio['set/movie.mp4']).toBeUndefined();
    expect(result.files.find((file) => file.path === 'set/movie.mp4')).toEqual({
      path: 'set/movie.mp4', mime: 'video/mp4', uri: 'file:///session/set%2Fmovie.mp4',
    });
    expect(result.files.find((file) => file.path === 'set/BG.png')?.uri).toBeDefined();
    expect(io.onProgress).toHaveBeenLastCalledWith(1);
  });

  it('所选难度缺失时不回退其它难度', async () => {
    await expect(readOsuChartPreviewArchive(await archive(), { ...target, beatmapId: 999 }, reader()))
      .rejects.toThrow('没有所选难度');
  });

  it('逐个落盘媒体，下一项解压前上一项已经写入', async () => {
    const loaded = await JSZip.loadAsync(await archive());
    const sample = loaded.file('set/BG.png');
    const proto = Object.getPrototypeOf(sample) as { async: (type: string) => Promise<Uint8Array> };
    const original = proto.async;
    const order: string[] = [];
    proto.async = function async(this: { name: string }, type: string) {
      if (/\.(png|mp4)$/iu.test(this.name)) order.push(`read:${this.name}`);
      return original.call(this, type);
    };
    try {
      const io = reader();
      io.stageMedia.mockImplementation(async (path: string) => {
        order.push(`stage:${path}`);
        return `file:///session/${encodeURIComponent(path)}`;
      });
      await readOsuChartPreviewArchive(await archive(), target, io);
      const bgRead = order.findIndex((item) => item.startsWith('read:') && /\.png$/iu.test(item));
      const bgStage = order.findIndex((item) => item.startsWith('stage:') && /\.png$/iu.test(item));
      const movieRead = order.findIndex((item) => item.startsWith('read:') && /\.mp4$/iu.test(item));
      const movieStage = order.findIndex((item) => item.startsWith('stage:') && /\.mp4$/iu.test(item));
      expect(bgRead).toBeGreaterThanOrEqual(0);
      expect(bgStage).toBeGreaterThan(bgRead);
      expect(movieRead).toBeGreaterThan(bgStage);
      expect(movieStage).toBeGreaterThan(movieRead);
    } finally {
      proto.async = original;
    }
  });

  it('媒体写入中途失败时不返回半份清单', async () => {
    const io = reader();
    io.stageMedia.mockImplementation(async (path: string) => {
      if (/\.mp4$/iu.test(path)) throw new Error('写入失败');
      return 'file:///session/image.png';
    });
    await expect(readOsuChartPreviewArchive(await archive(), target, io)).rejects.toThrow('写入失败');
    expect(io.stageMedia).toHaveBeenCalledTimes(2);
  });

  it('损坏的谱包不会开始落盘', async () => {
    const io = reader();
    await expect(readOsuChartPreviewArchive(Uint8Array.from([1, 2, 3]), target, io)).rejects.toThrow();
    expect(io.stageMedia).not.toHaveBeenCalled();
  });

  it('媒体缺失仍保留所选谱面供播放器提示并播放', async () => {
    const zip = new JSZip();
    zip.file('selected.osu', osu());
    const io = reader();
    const resources = await readOsuChartPreviewArchive(await zip.generateAsync({ type: 'uint8array' }), target, io);
    expect(resources.files.map((file) => file.path)).toEqual(['selected.osu']);
    expect(resources.audio).toEqual({});
    expect(io.stageMedia).not.toHaveBeenCalled();
  });

  it('Unicode 与特殊字符引用保留目录身份，不使用另一目录的同名图片', async () => {
    const zip = new JSZip();
    zip.file('曲包/难度/当前.osu', osu()
      .replace('music.ogg', '../音乐 ♪ #%.ogg')
      .replace('bg.PNG', () => '../背景,$&.PNG')
      .replace('movie.mp4', '../视频 [HD].mp4'));
    zip.file('曲包/音乐 ♪ #%.ogg', Uint8Array.from([1]));
    zip.file('曲包/背景,$&.png', Uint8Array.from([2]));
    zip.file('曲包/视频 [HD].mp4', Uint8Array.from([3]));
    zip.file('其它/背景,$&.png', Uint8Array.from([9]));
    const io = reader();
    const resources = await readOsuChartPreviewArchive(await zip.generateAsync({ type: 'uint8array' }), target, io);
    expect(resources.chartPath).toBe('曲包/难度/当前.osu');
    expect(resources.audio).toEqual({ '曲包/音乐 ♪ #%.ogg': 'AQ==' });
    expect(io.stageMedia.mock.calls.map(([path]) => path)).toEqual(['曲包/背景,$&.png', '曲包/视频 [HD].mp4']);
  });

  it('拒绝重复难度和不匹配的歌曲 ID', async () => {
    await expect(readOsuChartPreviewArchive(await archive((zip) => zip.file('copy.osu', osu())), target, reader()))
      .rejects.toThrow('重复的难度');
    await expect(readOsuChartPreviewArchive(await archive(), { ...target, beatmapsetId: 11 }, reader()))
      .rejects.toThrow('歌曲不匹配');
  });

  it('归一化路径保留目录语义并拒绝越界路径', async () => {
    await expect(readOsuChartPreviewArchive(await archive((zip) => zip.file('../outside.png', 'x')), target, reader()))
      .rejects.toThrow('无效的资源路径');
    await expect(readOsuChartPreviewArchive(await archive((zip) => zip.file('set/bg.PNG', 'x')), target, reader()))
      .rejects.toThrow('重复的资源路径');
    await expect(readOsuChartPreviewArchive(await archive((zip) => zip.file('set\\BG.png', 'x')), target, reader()))
      .rejects.toThrow('重复的资源路径');
    const normalized = await readOsuChartPreviewArchive(await archive((zip) => zip.file('set/./extra.png', 'x')), target, reader());
    expect(normalized.chartPath).toBe('set/selected.osu');
    await expect(readOsuChartPreviewArchive(await archive((zip) => zip.file('.', 'x')), target, reader()))
      .rejects.toThrow('无效的资源路径');
  });

  it('共享清理代次变化后不继续发布资源', async () => {
    const bytes = await archive();
    const assertCurrent = captureResourceWrites('shared');
    const stageMedia = vi.fn(async () => {
      invalidateResourceWrites('shared');
      return 'file:///session/image.png';
    });
    await expect(readOsuChartPreviewArchive(bytes, target, { assertCurrent, stageMedia }))
      .rejects.toThrow('缓存请求已失效');
    expect(stageMedia).toHaveBeenCalledTimes(1);
  });

  it('拒绝超多条目和声明解压量过大的谱包，且不落盘', async () => {
    const crowded = new JSZip();
    crowded.file('set/selected.osu', osu());
    for (let index = 0; index < CHART_PREVIEW_MAX_ARCHIVE_ENTRIES; index += 1) crowded.file(`extra-${index}.bin`, 'x');
    const crowdedReader = reader();
    await expect(readOsuChartPreviewArchive(await crowded.generateAsync({ type: 'uint8array' }), target, crowdedReader))
      .rejects.toThrow('谱面包条目数量超出预算');
    expect(crowdedReader.stageMedia).not.toHaveBeenCalled();

    const oversized = storedZip([{
      name: 'set/selected.osu',
      data: Buffer.from(osu()),
    }, {
      name: 'set/huge.bin',
      data: Buffer.alloc(0),
      uncompressedSize: CHART_PREVIEW_MAX_ENTRY_UNCOMPRESSED_BYTES + 1,
    }]);
    const oversizedReader = reader();
    await expect(readOsuChartPreviewArchive(oversized, target, oversizedReader))
      .rejects.toThrow('谱面资源解压大小超出预算');
    expect(oversizedReader.stageMedia).not.toHaveBeenCalled();
  });

  it('已取消的准备不会读取或写入媒体', async () => {
    const controller = new AbortController();
    controller.abort();
    const io = reader();
    await expect(readOsuChartPreviewArchive(await archive(), target, {
      ...io, assertCurrent: captureResourceWrites('shared', controller.signal),
    })).rejects.toBeDefined();
    expect(io.stageMedia).not.toHaveBeenCalled();
  });
});

describe('osu 谱面确认配置边界', () => {
  it('只接受明确的模式与正安全整数 ID', () => {
    expect(parseOsuChartPreviewTarget({ gameId: 'osu-catch', beatmapsetId: '10', beatmapId: '21' })).toEqual(target);
    for (const id of ['', '0', '-1', '1.5', '9007199254740992', 'Infinity']) {
      expect(parseOsuChartPreviewTarget({ gameId: 'osu-standard', beatmapsetId: '10', beatmapId: id })).toBeNull();
    }
    expect(parseOsuChartPreviewTarget({ gameId: 'maimai', beatmapsetId: '10', beatmapId: '21' })).toBeNull();
  });

  it('旧设置及无效值恢复默认，数字限制于支持范围', () => {
    expect(normalizeOsuChartPreviewSettings({
      holdWidth: -1, maniaScrollSpeed: 9.26, backgroundBrightness: NaN,
      backgroundBlur: 999, maniaSkin: 'other', videoEnabled: 'false', storyboardEnabled: false,
    })).toEqual({
      holdWidth: 10, maniaScrollSpeed: 9.3, backgroundBrightness: 20,
      backgroundBlur: 20, maniaSkin: 'brick', videoEnabled: true, storyboardEnabled: false,
      maniaIgnoreSV: false, maniaTrackOpacity: 100, taikoTrackOpacity: 100,
    });
  });

  it('谱面文字和资源名称不能终止注入脚本', () => {
    const html = applyOsuChartPreviewConfigToHtml('<!--OSU_CHART_PREVIEW_CONFIG-->', {
      theme: 'dark', requestedMode: 2, chartPath: 'a.osu',
      files: [{ path: 'a.osu', mime: 'text/plain', text: '</script><script>$&\u2028' }],
      settings: normalizeOsuChartPreviewSettings(null),
    });
    expect(html).not.toContain('</script><script>');
    expect(html).toContain('\\u003c/script>');
    expect(html).toContain('$&');
    expect(buildOsuChartPreviewAudioScript({ '</script>.ogg': 'AQID' })).not.toContain('</script>');
  });
});

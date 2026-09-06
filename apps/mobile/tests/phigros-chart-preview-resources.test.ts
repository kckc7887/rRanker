import { releaseFixture } from './fixtures/phigros-release';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadPhigrosChartPreviewBundle,
  phigrosChartPreviewLevelLabel,
  resolvePhigrosChartPreviewAssetBundle,
} from '@/domain/phigros-chart-preview';

const current = {
  gameVersion: '9.9.9',
  resourceVersion: '9.9.9-test',
  manifest: 'phigros/releases/9.9.9/manifest.json',
  catalog: 'phigros/releases/9.9.9/catalog.json',
};
const catalog = {
  songs: [{
    id: 'DistortedFate.Sakuzyo', title: 'Distorted Fate', composer: 'Sakuzyo', illustrator: 'knife',
    charters: ['EZ', 'HD', 'IN', 'AT charter'], difficulties: [8.1, 13.5, 16.3, 17.4],
  }],
};
const manifest = {
  assets: [
    { path: 'charts/DistortedFate.Sakuzyo.7/AT.json', size: 100, contentType: 'application/json' },
    { path: 'music/DistortedFate.Sakuzyo.ogg', size: 200, contentType: 'audio/ogg' },
    { path: 'illustrations/DistortedFate.Sakuzyo.png', size: 300, contentType: 'image/png' },
  ],
};

describe('phigros chart preview resource resolution（移植 demo resource-loader.test.mjs）', () => {
  it('通过 current 的 release 基址解析动态谱面目录和三类资产', () => {
    const result = resolvePhigrosChartPreviewAssetBundle({
      current, catalog, manifest, target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
      ossBase: 'https://assets.example/',
    });
    expect(result.chart.url).toBe('https://assets.example/phigros/releases/9.9.9/charts/DistortedFate.Sakuzyo.7/AT.json?v=9.9.9-test');
    expect(result.music.url).toBe('https://assets.example/phigros/releases/9.9.9/music/DistortedFate.Sakuzyo.ogg?v=9.9.9-test');
    expect(result.illustration.url).toBe('https://assets.example/phigros/releases/9.9.9/illustrations/DistortedFate.Sakuzyo.png?v=9.9.9-test');
    expect(result.song.difficultyConstant).toBe(17.4);
    expect(result.song.charter).toBe('AT charter');
  });

  it('资产重复或缺失时拒绝静默选取', () => {
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      current, catalog, manifest: { assets: manifest.assets.slice(1) },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
      ossBase: 'https://assets.example/',
    })).toThrow(/谱面.*0/);
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      current, catalog, manifest: { assets: [...manifest.assets, manifest.assets[0]!] },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
      ossBase: 'https://assets.example/',
    })).toThrow(/谱面.*2/);
  });

  it.each(['EZ', 'HD', 'IN'])('Random 的七套 %s 谱面优先使用与音乐一致的 .0', (difficulty) => {
    const id = 'Random.SobremSilentroom';
    const assets = [6, 3, 1, 5, 0, 4, 2].flatMap((variant) => ['EZ', 'HD', 'IN'].map((level) => ({
      path: `charts/${id}.${variant}/${level}.json`, size: 100, contentType: 'application/json',
    })));
    const result = resolvePhigrosChartPreviewAssetBundle({
      current, catalog: { songs: [{ ...catalog.songs[0], id }] },
      manifest: { assets: [...assets, { path: `music/${id}.ogg` }, { path: `illustrations/${id}.png` }] },
      target: { songId: id, difficulty },
    });
    expect(result.chart.path).toBe(`charts/${id}.0/${difficulty}.json`);
    expect(result.music.path).toBe(`music/${id}.ogg`);
  });

  it('默认目录缺少目标难度时不混入其它变体', () => {
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      current, catalog,
      manifest: { assets: [...manifest.assets, { path: 'charts/DistortedFate.Sakuzyo.0/IN.json' }] },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
    })).toThrow(/谱面.*0/);
  });

  it('没有默认目录且存在多个编号变体时仍拒绝歧义', () => {
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      current, catalog,
      manifest: { assets: [...manifest.assets, { path: 'charts/DistortedFate.Sakuzyo.1/AT.json' }] },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
    })).toThrow(/谱面.*2/);
  });

  it('仍拒绝默认路径在清单中重复出现', () => {
    const asset = { path: 'charts/DistortedFate.Sakuzyo.0/AT.json' };
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      current, catalog, manifest: { assets: [...manifest.assets, asset, asset] },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
    })).toThrow(/谱面.*2/);
  });

  it('缺少全尺寸曲绘时回退 lowres 曲绘', () => {
    const result = resolvePhigrosChartPreviewAssetBundle({
      current, catalog,
      manifest: {
        assets: [
          manifest.assets[0]!,
          manifest.assets[1]!,
          { path: 'illustrations-lowres/DistortedFate.Sakuzyo.png', size: 60, contentType: 'image/png' },
        ],
      },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
      ossBase: 'https://assets.example/',
    });
    expect(result.illustration.url).toBe('https://assets.example/phigros/releases/9.9.9/illustrations-lowres/DistortedFate.Sakuzyo.png?v=9.9.9-test');
  });

  it('曲目缺失、难度缺失与音乐缺失给出明确错误', () => {
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      current, catalog,
      manifest: { assets: manifest.assets },
      target: { songId: 'Missing.Song', difficulty: 'AT' },
      ossBase: 'https://assets.example/',
    })).toThrow(/数量异常：0/);
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      current,
      catalog: { songs: [{ ...catalog.songs[0]!, difficulties: [8.1, 13.5, 16.3] }] },
      manifest: { assets: manifest.assets },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
      ossBase: 'https://assets.example/',
    })).toThrow(/不存在 AT 难度/);
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      current, catalog,
      manifest: { assets: [manifest.assets[0]!, manifest.assets[2]!] },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
      ossBase: 'https://assets.example/',
    })).toThrow(/音乐.*0/);
  });

  it('难度下标映射 EZ/HD/IN/AT 并拒绝越界', () => {
    expect(phigrosChartPreviewLevelLabel(0)).toBe('EZ');
    expect(phigrosChartPreviewLevelLabel(3)).toBe('AT');
    expect(() => phigrosChartPreviewLevelLabel(4)).toThrow(/不支持的难度下标/);
  });

  it('catalog/manifest 请求 URL 携带发布版本并校验实际内容', async () => {
    const fixture = releaseFixture('9.9.9-test', ['DistortedFate.Sakuzyo']);
    const requests: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      requests.push(String(input));
      return fixture.respond(input);
    });
    const bundle = await loadPhigrosChartPreviewBundle(
      { songId: 'DistortedFate.Sakuzyo', difficulty: 'EZ' }, new AbortController().signal, 'https://assets.example',
    );
    expect(requests[0]).toContain('phigros/current.json?_check=');
    expect(requests).toContain('https://assets.example/phigros/releases/9.9.9/catalog.json?v=9.9.9-test');
    expect(requests).toContain('https://assets.example/phigros/releases/9.9.9/manifest.json?v=9.9.9-test');
    expect(bundle.chart.url).toContain('?v=9.9.9-test');
  });

});

afterEach(() => {
  vi.restoreAllMocks();
});

import { describe, expect, it } from 'vitest';
import {
  phigrosChartPreviewLevelLabel,
  resolvePhigrosChartPreviewAssetBundle,
} from '@/domain/phigros-chart-preview';

const current = {
  gameVersion: '9.9.9',
  resourceVersion: '9.9.9-test',
  manifest: 'phigros/releases/9.9.9/manifest.json',
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
    expect(result.chart.url).toBe('https://assets.example/phigros/releases/9.9.9/charts/DistortedFate.Sakuzyo.7/AT.json');
    expect(result.music.url).toBe('https://assets.example/phigros/releases/9.9.9/music/DistortedFate.Sakuzyo.ogg');
    expect(result.illustration.url).toBe('https://assets.example/phigros/releases/9.9.9/illustrations/DistortedFate.Sakuzyo.png');
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
    expect(result.illustration.url).toBe('https://assets.example/phigros/releases/9.9.9/illustrations-lowres/DistortedFate.Sakuzyo.png');
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
});

import { releaseFixture } from './fixtures/phigros-release';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhigrosResourceAsset } from '@/services/phigros-resources';
import { PHIGROS_OSS_BASE } from '@/domain/account-avatar';
import {
  phigrosChartPreviewLevelLabel,
  resolvePhigrosChartPreviewAssetBundle,
  resolvePhigrosChartPreviewVariants,
} from '@/domain/phigros-chart-preview';
import { loadPhigrosChartPreviewResources } from '@/services/phigros-chart-preview-resources';
import { phigrosResources } from '@/services/phigros-resources';

function asset(path: string, size = 1, contentType = 'application/json'): PhigrosResourceAsset {
  return { path, size, contentType, sha256: 'a'.repeat(64) };
}
const catalog = {
  songCount: 1,
  songs: [{
    id: 'DistortedFate.Sakuzyo', title: 'Distorted Fate', composer: 'Sakuzyo', illustrator: 'knife',
    charters: ['EZ', 'HD', 'IN', 'AT charter'], difficulties: [8.1, 13.5, 16.3, 17.4],
  }],
};
const manifest = {
  gameVersion: '9.9.9', generatedAt: '9.9.9-test',
  assets: [
    asset('charts/DistortedFate.Sakuzyo.7/AT.json', 100, 'application/json'),
    asset('music/DistortedFate.Sakuzyo.ogg', 200, 'audio/ogg'),
    asset('illustrations/DistortedFate.Sakuzyo.png', 300, 'image/png'),
  ],
};

describe('phigros chart preview resource resolution', () => {
  it('通过发布清单定位谱面、音乐、曲绘和导出信息', () => {
    const result = resolvePhigrosChartPreviewAssetBundle({
      catalog, manifest, target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
    });
    expect(result.chart.path).toBe('charts/DistortedFate.Sakuzyo.7/AT.json');
    expect(result.music.path).toBe('music/DistortedFate.Sakuzyo.ogg');
    expect(result.illustration.path).toBe('illustrations/DistortedFate.Sakuzyo.png');
    expect(result.song.difficultyConstant).toBe(17.4);
    expect(result.song.charter).toBe('AT charter');
  });

  it('资产重复或缺失时拒绝静默选取', () => {
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      catalog, manifest: { ...manifest, assets: manifest.assets.slice(1) },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
    })).toThrow(/谱面.*0/);
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      catalog, manifest: { ...manifest, assets: [...manifest.assets, manifest.assets[0]!] },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
    })).toThrow(/谱面.*2/);
  });

  it.each(['EZ', 'HD', 'IN'])('Random 的七套 %s 谱面优先使用与音乐一致的 .0', (difficulty) => {
    const id = 'Random.SobremSilentroom';
    const assets = [6, 3, 1, 5, 0, 4, 2].flatMap((variant) => ['EZ', 'HD', 'IN'].map((level) => asset(`charts/${id}.${variant}/${level}.json`, 100)));
    const result = resolvePhigrosChartPreviewAssetBundle({
      catalog: { ...catalog, songs: [{ ...catalog.songs[0], id }] },
      manifest: { ...manifest, assets: [...assets, asset(`music/${id}.ogg`), asset(`illustrations/${id}.png`)] },
      target: { songId: id, difficulty },
    });
    expect(result.chart.path).toBe(`charts/${id}.0/${difficulty}.json`);
    expect(result.music.path).toBe(`music/${id}.ogg`);
  });

  it('默认目录缺少目标难度时不混入其它变体', () => {
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      catalog,
      manifest: { ...manifest, assets: [...manifest.assets, asset('charts/DistortedFate.Sakuzyo.0/IN.json')] },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
    })).toThrow(/谱面.*0/);
  });

  it('专属音乐重复时拒绝回退歌曲共用音乐', () => {
    const music = asset('music/DistortedFate.Sakuzyo.7.ogg');
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      catalog, manifest: { ...manifest, assets: [...manifest.assets, music, music] },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT', variantIndex: 7 },
    })).toThrow(/音乐.*2/);
  });

  it('没有默认目录且存在多个编号变体时仍拒绝歧义', () => {
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      catalog,
      manifest: { ...manifest, assets: [...manifest.assets, asset('charts/DistortedFate.Sakuzyo.1/AT.json')] },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
    })).toThrow(/谱面.*2/);
  });

  it('仍拒绝默认路径在清单中重复出现', () => {
    const duplicate = asset('charts/DistortedFate.Sakuzyo.0/AT.json');
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      catalog, manifest: { ...manifest, assets: [...manifest.assets, duplicate, duplicate] },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
    })).toThrow(/谱面.*2/);
  });

  it('缺少全尺寸曲绘时回退 lowres 曲绘', () => {
    const result = resolvePhigrosChartPreviewAssetBundle({
      catalog,
      manifest: {
        ...manifest, assets: [
          manifest.assets[0]!,
          manifest.assets[1]!,
          asset('illustrations-lowres/DistortedFate.Sakuzyo.png', 60, 'image/png'),
        ],
      },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
    });
    expect(result.illustration.path).toBe('illustrations-lowres/DistortedFate.Sakuzyo.png');
  });

  it('曲目缺失、难度缺失与音乐缺失给出明确错误', () => {
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      catalog,
      manifest: { ...manifest, assets: manifest.assets },
      target: { songId: 'Missing.Song', difficulty: 'AT' },
    })).toThrow(/数量异常：0/);
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      catalog: { ...catalog, songs: [{ ...catalog.songs[0]!, difficulties: [8.1, 13.5, 16.3] }] },
      manifest: { ...manifest, assets: manifest.assets },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
    })).toThrow(/不存在 AT 难度/);
    expect(() => resolvePhigrosChartPreviewAssetBundle({
      catalog,
      manifest: { ...manifest, assets: [manifest.assets[0]!, manifest.assets[2]!] },
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
    })).toThrow(/音乐.*0/);
  });

  it('难度下标映射 EZ/HD/IN/AT 并拒绝越界', () => {
    expect(phigrosChartPreviewLevelLabel(0)).toBe('EZ');
    expect(phigrosChartPreviewLevelLabel(3)).toBe('AT');
    expect(() => phigrosChartPreviewLevelLabel(4)).toThrow(/不支持的难度下标/);
  });

  it('只列出目标难度的变体并拒绝重复编号', () => {
    const target = { songId: 'Random.SobremSilentroom', difficulty: 'AT' };
    expect(resolvePhigrosChartPreviewVariants([
      asset('charts/Random.SobremSilentroom.2/AT.json'),
      asset('charts/Random.SobremSilentroom.0/AT.json'),
      asset('charts/Random.SobremSilentroom.1/AT.json'),
      asset('charts/Random.SobremSilentroom.0/EZ.json'),
      asset('charts/Other.Song.3/AT.json'),
    ], target)).toEqual([0, 1, 2]);
    expect(() => resolvePhigrosChartPreviewVariants([
      asset('charts/Random.SobremSilentroom.1/AT.json'),
      asset('charts/Random.SobremSilentroom.1/AT.json'),
    ], target)).toThrow('谱面编号重复或无效');
  });

  it('catalog/manifest 请求 URL 携带发布版本并校验实际内容', async () => {
    const fixture = releaseFixture('9.9.9-test', ['DistortedFate.Sakuzyo']);
    const requests: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      requests.push(String(input));
      return fixture.respond(input);
    });
    await loadPhigrosChartPreviewResources(
      { songId: 'DistortedFate.Sakuzyo', difficulty: 'EZ' }, new AbortController().signal, (asset) => phigrosResources.bytes(asset.url),
    );
    expect(requests[0]).toContain('phigros/current.json?_check=');
    expect(requests).toContain(`${PHIGROS_OSS_BASE}/phigros/releases/9.9.9/catalog.json?v=9.9.9-test`);
    expect(requests).toContain(`${PHIGROS_OSS_BASE}/phigros/releases/9.9.9/manifest.json?v=9.9.9-test`);
    expect(requests).toContain(`${PHIGROS_OSS_BASE}/phigros/releases/9.9.9/charts/DistortedFate.Sakuzyo.0/EZ.json?v=9.9.9-test`);
  });

});

afterEach(() => {
  phigrosResources.clear();
  vi.restoreAllMocks();
});

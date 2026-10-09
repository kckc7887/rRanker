import { releaseFixture } from './fixtures/phigros-release';
import { createHash } from 'node:crypto';
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

const native = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  beforeHash: undefined as (() => Promise<void>) | undefined,
}));
vi.mock('expo-modules-core', () => ({
  requireNativeModule: () => ({
    sha256FileAsync: async (uri: string) => {
      const bytes = native.files.get(uri);
      if (!bytes) throw new Error('file not found');
      await native.beforeHash?.();
      return createHash('sha256').update(bytes).digest('hex');
    },
  }),
}));

function asset(path: string, size = 1, contentType = 'application/json'): PhigrosResourceAsset {
  return { path, objectKey: `phigros/${path.split('/')[0]}/${'a'.repeat(64)}.${path.split('.').at(-1)}`, size, contentType, sha256: 'a'.repeat(64) };
}
const catalog = {
  songCount: 1,
  songs: [{
    id: 'DistortedFate.Sakuzyo', title: 'Distorted Fate', composer: 'Sakuzyo', illustrator: 'knife',
    charters: ['EZ', 'HD', 'IN', 'AT charter'], difficulties: [8.1, 13.5, 16.3, 17.4],
  }],
};
const manifest = {
  schemaVersion: 2 as const, resourceVersion: 'r1',
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

  it('通过清单映射请求固定哈希地址并校验实际内容', async () => {
    const fixture = releaseFixture('9.9.9-test', ['DistortedFate.Sakuzyo']);
    const requests: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      requests.push(String(input));
      return fixture.respond(input);
    });
    await loadPhigrosChartPreviewResources(
      { songId: 'DistortedFate.Sakuzyo', difficulty: 'EZ' }, new AbortController().signal, (asset) => phigrosResources.bytes(asset.url),
    );
    expect(requests[0]).toContain('phigros/latest.json?_check=');
    expect(requests).toContain(`${PHIGROS_OSS_BASE}/${fixture.current.catalog}`);
    expect(requests).toContain(`${PHIGROS_OSS_BASE}/${fixture.current.manifest}`);
    expect(requests).toContain(`${PHIGROS_OSS_BASE}/${fixture.objectKeys['charts/DistortedFate.Sakuzyo.0/EZ.json']}`);
  });

  it.each(['valid', 'corrupt', 'io failure', 'cancel', 'clear'] as const)('handles %s local files without publishing invalid preview resources', async outcome => {
    const fixture = releaseFixture('r1', ['Song.A']);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => fixture.respond(input));
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const read = async (asset: { path: string }) => {
      const bytes = Uint8Array.from(fixture.files[asset.path]!);
      if (outcome === 'corrupt') bytes[0] ^= 0xff;
      const uri = `file:///preview/${asset.path}`;
      native.files.set(uri, bytes);
      return { uri, size: bytes.byteLength, bytes: async () => {
        if (outcome !== 'valid') throw new Error('unverified file exposed to player');
        return bytes;
      } };
    };
    if (outcome === 'io failure') native.beforeHash = async () => { throw new Error('file read failed'); };
    if (outcome === 'cancel') native.beforeHash = async () => { controller.abort(reason); };
    if (outcome === 'clear') native.beforeHash = async () => { phigrosResources.clear(); };
    const result = loadPhigrosChartPreviewResources({ songId: 'Song.A', difficulty: 'EZ' }, controller.signal, read);
    if (outcome === 'valid') {
      await expect(result).resolves.toMatchObject({
        chart: fixture.files['charts/Song.A.0/EZ.json'],
        music: fixture.files['music/Song.A.ogg'],
        illustration: fixture.files['illustrations/Song.A.png'],
      });
    } else if (outcome === 'cancel') await expect(result).rejects.toBe(reason);
    else await expect(result).rejects.toThrow(outcome === 'corrupt' ? '资源校验失败' : outcome === 'clear' ? 'Resource generation changed' : 'file read failed');
  });

});

afterEach(() => {
  phigrosResources.clear();
  vi.restoreAllMocks();
  native.files.clear();
  native.beforeHash = undefined;
});

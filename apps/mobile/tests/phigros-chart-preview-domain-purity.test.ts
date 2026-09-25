import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  phigrosChartPreviewLevelLabel,
  resolvePhigrosChartPreviewAssetBundle,
  resolvePhigrosChartPreviewVariants,
} from '@/domain/phigros-chart-preview';

const DOMAIN_FILE = 'src/domain/phigros-chart-preview.ts';
/** 领域层不得静态引入网络、资源单例、存储、状态或平台模块。 */
const FORBIDDEN_STATIC_IMPORTS = [
  /^@\/services\//,
  /^@\/providers\//,
  /^@\/storage\//,
  /^@\/state\//,
  /^@\/hooks\//,
  /^@\/features\//,
  /^expo(-|\/)/,
  /^react(-|\/|$)/,
];

/** 静态 import/export ... from 说明符；动态 import() 不属于模块加载期依赖。 */
function staticSpecifiers(source: string): string[] {
  const matches = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1]!);
  const bare = [...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map((match) => match[1]!);
  return [...matches, ...bare];
}

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

describe('Phigros 谱面确认领域模块', () => {
  it('静态依赖中不含网络、资源单例、存储、状态与平台模块', () => {
    const source = readFileSync(resolve(process.cwd(), DOMAIN_FILE), 'utf8');
    const forbidden = staticSpecifiers(source).filter((specifier) => (
      FORBIDDEN_STATIC_IMPORTS.some((pattern) => pattern.test(specifier))
    ));
    expect(forbidden).toEqual([]);
  });

  it('纯解析在没有任何 fetch 与对象存储替换的情况下定位三类资产', () => {
    const bundle = resolvePhigrosChartPreviewAssetBundle({
      current, catalog, manifest,
      target: { songId: 'DistortedFate.Sakuzyo', difficulty: 'AT' },
      ossBase: 'https://assets.example/',
    });
    expect(bundle.chart.url).toBe('https://assets.example/phigros/releases/9.9.9/charts/DistortedFate.Sakuzyo.7/AT.json?v=9.9.9-test');
    expect(phigrosChartPreviewLevelLabel(3)).toBe('AT');
  });

  it('变体编号解析是清单上的纯计算，重复或无效编号直接拒绝', () => {
    expect(resolvePhigrosChartPreviewVariants([
      { path: 'charts/Random.SobremSilentroom.2/AT.json' },
      { path: 'charts/Random.SobremSilentroom.0/AT.json' },
      { path: 'charts/Random.SobremSilentroom.1/AT.json' },
      { path: 'charts/Random.SobremSilentroom.0/EZ.json' },
      { path: 'charts/Other.Song.3/AT.json' },
    ], { songId: 'Random.SobremSilentroom', difficulty: 'AT' })).toEqual([0, 1, 2]);
    expect(() => resolvePhigrosChartPreviewVariants([
      { path: 'charts/Random.SobremSilentroom.1/AT.json' },
      { path: 'charts/Random.SobremSilentroom.1/AT.json' },
    ], { songId: 'Random.SobremSilentroom', difficulty: 'AT' })).toThrow('谱面编号重复或无效');
  });
});

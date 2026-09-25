import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rizlineCatalog, rizlineCatalogAssetFiles, rizlineChart, rizlineSong } from './fixtures/rizline';
import { resolveRizlineChartPreviewBundle } from '@/domain/rizline-chart-preview';

const DOMAIN_FILE = 'src/domain/rizline-chart-preview.ts';
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

const hash = 'a'.repeat(64);

describe('Rizline 谱面确认领域模块', () => {
  it('静态依赖中不含网络、资源单例、存储、状态与平台模块', () => {
    const source = readFileSync(resolve(process.cwd(), DOMAIN_FILE), 'utf8');
    const forbidden = staticSpecifiers(source).filter((specifier) => (
      FORBIDDEN_STATIC_IMPORTS.some((pattern) => pattern.test(specifier))
    ));
    expect(forbidden).toEqual([]);
  });

  it('纯解析在没有任何 fetch 与资源仓储替换的情况下定位谱面与音频', () => {
    const snapshot = rizlineCatalog();
    const release = {
      snapshot,
      files: [
        { path: 'rizline/releases/r1/catalog.json', size: 1, sha256: hash },
        ...rizlineCatalogAssetFiles(snapshot).map((file) => ({ ...file, sha256: hash })),
      ],
    };
    const bundle = resolveRizlineChartPreviewBundle(release, { songId: 'Song.A.0', levelIndex: 2 });
    expect(bundle.chart.path).toBe('rizline/releases/r1/charts/Song.A.0.IN.json');
    expect(bundle.music.path).toBe('rizline/releases/r1/audio/Song.A.0.m4a');
    expect(bundle.chart.difficulty).toBe('IN');
  });

  it('纯解析只依赖结构化的发布快照与清单文件，不要求服务层类型', () => {
    const release = {
      snapshot: rizlineCatalog(),
      files: [{ path: 'rizline/releases/r1/charts/Song.A.0.IN.json', size: 3, sha256: hash }],
    };
    expect(() => resolveRizlineChartPreviewBundle(release, { songId: 'Song.A.0', levelIndex: 2 }))
      .toThrow('音频文件不在发布清单中');
    expect(() => resolveRizlineChartPreviewBundle({
      ...release,
      snapshot: {
        ...release.snapshot,
        songs: [rizlineSong({ charts: [rizlineChart({ chartPath: 'charts/missing.json' })] })],
      } as typeof release.snapshot,
    }, { songId: 'Song.A.0', levelIndex: 2 })).toThrow('谱面文件不在发布清单中');
  });
});

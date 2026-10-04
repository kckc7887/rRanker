import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const mobileRoot = resolve(__dirname, '..');
const requirePackage = createRequire(join(mobileRoot, 'package.json'));
const metroAssetPath = join(dirname(requirePackage.resolve('metro/package.json')), 'src/Assets.js');

describe('依赖适配的实际消费者', () => {
  it('CJS 和 ESM 入口都能解码 Unicode', async () => {
    expect(requirePackage('decode-uri-component')('%E4%B8%AD')).toBe('中');
    const esm = await import('decode-uri-component');
    expect(esm.default('%E4%B8%AD')).toBe('中');
  });

  it('query-string 处理 Unicode、重复 state 和畸形编码', () => {
    const query = requirePackage('query-string');
    expect(query.parse('name=%E4%B8%AD&state=a&state=b')).toEqual({ name: '中', state: ['a', 'b'] });
    expect(query.stringify({ state: 'a', name: '中' }, { sort: false })).toBe('state=a&name=%E4%B8%AD');
    expect(query.parse('state=%FF').state).toBe('%FF');
  });

  it('Expo Router 拼接回调查询参数和 hash', () => {
    const path = join(dirname(requirePackage.resolve('expo-router/package.json')), 'build/fork/getPathFromState-forks.js');
    const exports: { appendQueryAndHash?: (path: string, params: Record<string, string>) => string } = {};
    runInNewContext(readFileSync(path, 'utf8'), {
      exports, process,
      require(id: string) {
        if (id === 'query-string') return requirePackage(id);
        if (id === '@react-navigation/native' || id === '../matchers') return {};
        throw new Error(`未模拟的路由依赖：${id}`);
      },
    });
    expect(exports.appendQueryAndHash?.('/oauth/lxns', { state: 'safe state', '#': 'done' })).toBe('/oauth/lxns?state=safe%20state#done');
  });

  it('Metro 从 PNG 字节读取尺寸', () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT1sAAAAASUVORK5CYII=', 'base64');
    expect(requirePackage(metroAssetPath).getAssetSize('png', png, 'sample.png')).toEqual({ width: 1, height: 1 });
  });

  it.each([
    ['node_modules/expo-router/assets/file.png', 48, 48, 'png', 'file'],
    ['assets/images/phira.webp', 1024, 1024, 'webp', 'phira'],
  ] as const)('Metro 从文件读取 %s 的尺寸', async (file, width, height, type, name) => {
    const assetPath = join(mobileRoot, file);
    const data = await requirePackage(metroAssetPath).getAssetData(assetPath, file, [], 'android', '/assets');
    expect(data).toMatchObject({ width, height, type, name });
    expect(data.files).toEqual([assetPath]);
  });

  it('Metro 处理分辨率缩放和异步资产插件', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'rranker-metro-assets-'));
    try {
      const assetPath = join(directory, 'sample@2x.png');
      copyFileSync(join(mobileRoot, 'node_modules/expo-router/assets/file.png'), assetPath);
      const pluginPath = join(directory, 'plugin.cjs');
      writeFileSync(pluginPath, 'module.exports = async data => ({ ...data, pluginWidth: data.width });');
      const data = await requirePackage(metroAssetPath).getAssetData(assetPath, 'sample@2x.png', [pluginPath], 'android', '/assets');
      expect(data).toMatchObject({ width: 24, height: 24, scales: [2], pluginWidth: 24 });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('Expo autolinking 选择文件系统原生源码', () => {
    const metadataPath = requirePackage.resolve('expo-modules-autolinking/package.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    const cli = join(dirname(metadataPath), metadata.bin['expo-modules-autolinking']);
    const result = spawnSync(process.execPath, [cli, 'resolve', '--platform', 'android', '--json'], { cwd: mobileRoot, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(result.stdout);
    expect(config.configuration.buildFromSource).toContain('expo-file-system');
    expect(config.modules.find((item: { packageName: string }) => item.packageName === 'expo-file-system').projects[0].sourceDir.replaceAll('\\', '/')).toContain('expo-file-system/android');
  });
});

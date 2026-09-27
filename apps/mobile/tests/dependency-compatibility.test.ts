import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const mobileRoot = resolve(__dirname, '..');
const requirePackage = createRequire(join(mobileRoot, 'package.json'));

describe('安全补丁的实际消费者兼容合同', () => {
  it('拒绝不符合已核验 SHA 的依赖源码并使安装失败', () => {
    const directory = mkdtempSync(join(tmpdir(), 'rranker-uri-contract-'));
    try {
      const dependency = join(directory, 'node_modules/decode-uri-component');
      mkdirSync(dependency, { recursive: true });
      const metadata = JSON.stringify({ name: 'decode-uri-component', version: '0.5.0', main: 'index.js', type: 'module' });
      writeFileSync(join(dependency, 'package.json'), metadata);
      writeFileSync(join(dependency, 'index.js'), 'export default function decodeUriComponent(value) { return value; }');
      const script = join(directory, 'patch.cjs');
      copyFileSync(join(mobileRoot, 'scripts/patch-decode-uri-component.cjs'), script);
      const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('补丁版本或源码不符合已验证契约');
      expect(readFileSync(join(dependency, 'package.json'), 'utf8')).toBe(metadata);
    } finally {
      const target = resolve(directory);
      const withinTemporaryRoot = relative(resolve(tmpdir()), target);
      if (isAbsolute(withinTemporaryRoot) || withinTemporaryRoot === '' || withinTemporaryRoot.startsWith('..')) {
        throw new Error('临时测试目录超出清理边界');
      }
      rmSync(target, { recursive: true, force: true });
    }
  });
  it('官方 URI 补丁的 CJS 适配可重复运行且保留 ESM 入口', async () => {
    const script = join(mobileRoot, 'scripts/patch-decode-uri-component.cjs');
    const packagePath = requirePackage.resolve('decode-uri-component');
    const directory = dirname(packagePath);
    const before = readFileSync(join(directory, 'index.js'), 'utf8');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = spawnSync(process.execPath, [script], { cwd: mobileRoot, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
    }
    expect(readFileSync(join(directory, 'index.js'), 'utf8')).toBe(before);
    expect(requirePackage('decode-uri-component')('%E4%B8%AD')).toBe('中');
    const esm = await import('decode-uri-component');
    expect(esm.default('%E4%B8%AD')).toBe('中');
  });

  it('query-string 7 仍支持 Unicode、重复 state 与畸形编码，并终止恶意解码', () => {
    const query = requirePackage('query-string');
    expect(query.parse('name=%E4%B8%AD&state=a&state=b')).toEqual({ name: '中', state: ['a', 'b'] });
    expect(query.stringify({ state: 'a', name: '中' }, { sort: false })).toBe('state=a&name=%E4%B8%AD');
    const malformed = '%FF'.repeat(10_000);
    const script = `const q=require('query-string');const raw='%FF'.repeat(10000);if(q.parse('state='+raw).state!==raw)process.exit(1);`;
    const result = spawnSync(process.execPath, ['-e', script], { cwd: mobileRoot, timeout: 2_000, encoding: 'utf8' });
    expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(0);
    expect(query.parse(`state=${malformed}`).state).toBe(malformed);
  });

  it('Expo Router 当前实际 helper 保持 query-string 的命名方法合同', () => {
    const path = join(dirname(requirePackage.resolve('expo-router/package.json')), 'build/fork/getPathFromState-forks.js');
    const exports: { appendQueryAndHash?: (path: string, params: Record<string, string>) => string } = {};
    runInNewContext(readFileSync(path, 'utf8'), {
      exports, process,
      require(id: string) {
        if (id === 'query-string') return requirePackage(id);
        if (id === '@react-navigation/native' || id === '../matchers') return {};
        throw new Error(`未核验的路由依赖：${id}`);
      },
    });
    expect(exports.appendQueryAndHash?.('/oauth/lxns', { state: 'safe state', '#': 'done' })).toBe('/oauth/lxns?state=safe%20state#done');
  });

  it('Metro 当前资产入口保持 PNG 解码尺寸和 image-size 默认导出合同', () => {
    const path = join(dirname(requirePackage.resolve('metro/package.json')), 'src/Assets.js');
    const assets = requirePackage(path);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT1sAAAAASUVORK5CYII=', 'base64');
    expect(assets.getAssetSize('png', png, 'sample.png')).toEqual({ width: 1, height: 1 });
  });

  it('xcode 当前 generateUuid 保持 CJS v4 调用、长度和唯一性', () => {
    const project = requirePackage('xcode').project('project.pbxproj');
    project.hash = { project: { objects: {} } };
    const identifiers = Array.from({ length: 16 }, () => project.generateUuid());
    expect(identifiers.every(identifier => /^[A-F0-9]{24}$/.test(identifier))).toBe(true);
    expect(new Set(identifiers).size).toBe(identifiers.length);
  });
});

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';

const mobileRoot = resolve(__dirname, '..');
const requirePackage = createRequire(join(mobileRoot, 'package.json'));
const metroPatch = join(mobileRoot, 'scripts/patch-metro-image-size.cjs');
const metroAssetPath = join(dirname(requirePackage.resolve('metro/package.json')), 'src/Assets.js');
const fileHandlePatch = join(mobileRoot, 'scripts/patch-expo-file-handle.cjs');
const fileHandlePath = join(dirname(requirePackage.resolve('expo-file-system/package.json')), 'android/src/main/java/expo/modules/filesystem/FileSystemFileHandle.kt');

function removeTemporaryDirectory(directory: string): void {
  const target = resolve(directory);
  const withinTemporaryRoot = relative(resolve(tmpdir()), target);
  if (isAbsolute(withinTemporaryRoot) || withinTemporaryRoot === '' || withinTemporaryRoot.startsWith('..')) {
    throw new Error('临时测试目录超出清理边界');
  }
  rmSync(target, { recursive: true, force: true });
}

describe('安全补丁的实际消费者兼容合同', () => {
  beforeAll(() => {
    const result = spawnSync(process.execPath, [metroPatch], { cwd: mobileRoot, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });

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
      removeTemporaryDirectory(directory);
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
    const assets = requirePackage(metroAssetPath);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT1sAAAAASUVORK5CYII=', 'base64');
    expect(assets.getAssetSize('png', png, 'sample.png')).toEqual({ width: 1, height: 1 });
  });

  it('Metro 文件入口适配可重复运行且保留安全 image-size 2 版本', () => {
    const before = readFileSync(metroAssetPath, 'utf8');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = spawnSync(process.execPath, [metroPatch], { cwd: mobileRoot, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
    }
    expect(readFileSync(metroAssetPath, 'utf8')).toBe(before);
    const metroRequire = createRequire(requirePackage.resolve('metro/package.json'));
    const entry = metroRequire.resolve('image-size');
    expect(JSON.parse(readFileSync(join(dirname(entry), '../../package.json'), 'utf8')).version).toBe('2.0.4');
  });

  it.each(['metro-version', 'image-version', 'source'] as const)('Metro 适配拒绝未核验的 %s 并保持原文件', (drift) => {
    const directory = mkdtempSync(join(tmpdir(), 'rranker-metro-contract-'));
    try {
      const metroDirectory = join(directory, 'node_modules/metro');
      const imageDirectory = join(directory, 'node_modules/image-size');
      mkdirSync(join(metroDirectory, 'src'), { recursive: true });
      mkdirSync(join(imageDirectory, 'dist/cjs'), { recursive: true });
      writeFileSync(join(metroDirectory, 'package.json'), JSON.stringify({ name: 'metro', version: drift === 'metro-version' ? '0.83.4' : '0.83.3' }));
      writeFileSync(join(imageDirectory, 'package.json'), JSON.stringify({ name: 'image-size', version: drift === 'image-version' ? '2.0.5' : '2.0.4', main: 'dist/cjs/index.js' }));
      writeFileSync(join(imageDirectory, 'dist/cjs/index.js'), 'module.exports = {};');
      const source = readFileSync(metroAssetPath, 'utf8') + (drift === 'source' ? '\n// changed\n' : '');
      const assetPath = join(metroDirectory, 'src/Assets.js');
      writeFileSync(assetPath, source);
      const script = join(directory, 'patch.cjs');
      copyFileSync(metroPatch, script);
      const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Metro image-size 补丁版本或源码不符合已验证契约');
      expect(readFileSync(assetPath, 'utf8')).toBe(source);
    } finally {
      removeTemporaryDirectory(directory);
    }
  });

  it.each([
    ['node_modules/expo-router/assets/file.png', 48, 48, 'png', 'file', '/assets/node_modules/expo-router/assets'],
    ['assets/phigros-b30-reference/b19/res/666.jpeg', 1226, 1920, 'jpeg', '666', '/assets/assets/phigros-b30-reference/b19/res'],
    ['assets/images/phira.webp', 1024, 1024, 'webp', 'phira', '/assets/assets/images'],
  ] as const)('Metro getAssetData 通过真实文件路径读取 %s', async (file, width, height, type, name, httpServerLocation) => {
    const assetPath = join(mobileRoot, file);
    const assets = requirePackage(metroAssetPath);
    const data = await assets.getAssetData(assetPath, file, [], 'android', '/assets');
    expect(data).toMatchObject({ __packager_asset: true, width, height, type, name, httpServerLocation });
    expect(data.files).toEqual([assetPath]);
    expect(data.scales).toEqual([1]);
    const bytes = readFileSync(assetPath);
    expect(data.hash).toBe(createHash('md5').update(bytes).digest('hex'));
    expect(assets.getAssetSize(type, bytes, assetPath)).toEqual({ width, height });
  });

  it('Metro 文件尺寸适配保留分辨率缩放与异步资产插件', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'rranker-metro-assets-'));
    try {
      const assetPath = join(directory, 'sample@2x.png');
      copyFileSync(join(mobileRoot, 'node_modules/expo-router/assets/file.png'), assetPath);
      const pluginPath = join(directory, 'plugin.cjs');
      writeFileSync(pluginPath, 'module.exports = async data => ({ ...data, pluginWidth: data.width });');
      const data = await requirePackage(metroAssetPath).getAssetData(assetPath, 'sample@2x.png', [pluginPath], 'android', '/assets');
      expect(data).toMatchObject({ width: 24, height: 24, scales: [2], pluginWidth: 24 });
    } finally {
      removeTemporaryDirectory(directory);
    }
  });

  it('xcode 当前 generateUuid 保持 CJS v4 调用、长度和唯一性', () => {
    const project = requirePackage('xcode').project('project.pbxproj');
    project.hash = { project: { objects: {} } };
    const identifiers = Array.from({ length: 16 }, () => project.generateUuid());
    expect(identifiers.every(identifier => /^[A-F0-9]{24}$/.test(identifier))).toBe(true);
    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  it('Expo Android 文件句柄补丁可重复执行并核验已安装原生源码', () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync(process.execPath, [fileHandlePatch], { cwd: mobileRoot, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
    }
    expect(createHash('sha256').update(readFileSync(fileHandlePath)).digest('hex')).toBe('0ff23e6c358721d9d1c8399960c7bb544a32759e8f0bc4ecc549bc714f9f2c1b');
  });

  it('Expo autolinking 实际配置编译已修正的文件系统源码', () => {
    const metadataPath = requirePackage.resolve('expo-modules-autolinking/package.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    const cli = join(dirname(metadataPath), metadata.bin['expo-modules-autolinking']);
    const result = spawnSync(process.execPath, [cli, 'resolve', '--platform', 'android', '--json'], { cwd: mobileRoot, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(result.stdout);
    expect(config.configuration.buildFromSource).toEqual(['expo-file-system']);
    expect(config.modules.find((item: { packageName: string }) => item.packageName === 'expo-file-system').projects[0].sourceDir.replaceAll('\\', '/')).toContain('expo-file-system/android');
  });

  it.each(['version', 'source'] as const)('Expo 文件句柄补丁拒绝未核验的 %s 并保持原文件', drift => {
    const directory = mkdtempSync(join(tmpdir(), 'rranker-file-handle-contract-'));
    try {
      const dependency = join(directory, 'node_modules/expo-file-system');
      const target = join(dependency, 'android/src/main/java/expo/modules/filesystem/FileSystemFileHandle.kt');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(join(dependency, 'package.json'), JSON.stringify({ name: 'expo-file-system', version: drift === 'version' ? '19.0.25' : '19.0.24' }));
      const source = readFileSync(fileHandlePath, 'utf8') + (drift === 'source' ? '\n// changed\n' : '');
      writeFileSync(target, source);
      const script = join(directory, 'patch.cjs');
      copyFileSync(fileHandlePatch, script);
      const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Expo 文件句柄补丁版本或源码不符合已验证契约');
      expect(readFileSync(target, 'utf8')).toBe(source);
    } finally { removeTemporaryDirectory(directory); }
  });

  it('Expo CLI 的实际 undici 消费者保持补丁版本和本地请求能力', async () => {
    const expoRequire = createRequire(requirePackage.resolve('expo/package.json'));
    const cliRequire = createRequire(expoRequire.resolve('@expo/cli/package.json'));
    expect(cliRequire('undici/package.json').version).toBe('6.28.1');
    const server = createServer((_request, response) => { response.setHeader('Content-Type', 'application/json'); response.end('{"ok":true}'); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('测试服务地址不可用');
      const response = await cliRequire('undici').request(`http://127.0.0.1:${address.port}`);
      expect(response.statusCode).toBe(200);
      expect(await response.body.json()).toEqual({ ok: true });
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
});

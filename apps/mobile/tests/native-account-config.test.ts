import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path, { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

type Resolution = { type: 'sourceFile'; filePath: string };
type Dependency = { name: string; data: { isESMImport: boolean } };
type Resolve = (context: { originModulePath: string }, moduleName: string, platform: string) => Resolution;
type DependencyGraph = {
  _resolutionCache: Map<string, unknown>;
  _moduleResolver: { resolveDependency: (origin: string, dependency: Dependency) => Resolution };
  resolveDependency: (origin: string, dependency: Dependency, platform: string, options: object) => Resolution;
};
const requirePackage = createRequire(import.meta.url);
const { default: MetroDependencyGraph } = requirePackage('metro/private/node-haste/DependencyGraph') as {
  default: { prototype: DependencyGraph };
};
const app = JSON.parse(readFileSync(resolve('app.json'), 'utf8'));
function config(main: string) {
  const module = { exports: {} as typeof app };
  runInNewContext(readFileSync(resolve('app.config.js'), 'utf8'), { module,
    require: (name: string) => name === './app.json' ? app : { main }, process: { env: {} } });
  return module.exports.expo;
}
function resolver(main: string, resolveFile: (name: string) => string = () => '/ordinary.js') {
  const module = { exports: {} as { resolver: { resolveRequest: Resolve } } };
  const nativeResolve = vi.fn((_context: { originModulePath: string }, name: string): Resolution => ({
    type: 'sourceFile', filePath: resolveFile(name),
  }));
  const require = Object.assign((name: string) => {
    if (name === 'expo/metro-config') return { getDefaultConfig: () => ({ resolver: { assetExts: [], resolveRequest: nativeResolve } }) };
    if (name === 'path') return path;
    if (name === './package.json') return { main };
    throw new Error(`Unexpected module ${name}`);
  }, { resolve: () => resolve('dependency/zod/package.json') });
  runInNewContext(readFileSync(resolve('metro.config.js'), 'utf8'), { module, require, __dirname: process.cwd() });
  return { resolve: module.exports.resolver.resolveRequest, nativeResolve };
}

function fetchSpecifier(file: string): string {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const imports = source.statements.filter(ts.isImportDeclaration).filter(statement =>
    ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text.startsWith('expo/fetch'));
  expect(imports).toHaveLength(1);
  const specifier = imports[0].moduleSpecifier;
  if (!ts.isStringLiteral(specifier)) throw new Error('Expected fetch module specifier');
  return specifier.text;
}

function cachedResolver(main: string) {
  const graph = Object.create(MetroDependencyGraph.prototype) as DependencyGraph;
  graph._resolutionCache = new Map();
  const project = resolver(main, name => requirePackage.resolve(name));
  const resolveDependency = vi.fn((origin: string, dependency: Dependency) =>
    project.resolve({ originModulePath: origin }, dependency.name, 'android'));
  graph._moduleResolver = { resolveDependency };
  return { graph, resolveDependency };
}

describe('native account probe build isolation', () => {
  it('keeps production identity and network plugin unchanged', () => {
    const production = config('expo-router/entry');
    expect(production.android.package).toBe(app.expo.android.package);
    expect(production.scheme).toBe(app.expo.scheme);
    expect(production.plugins).not.toContain('./tests/native/with-account-probe-network.js');
    const probe = config('native-account-recovery-entry.tsx');
    expect(probe.android.package).toBe('com.rranker.app.nativeprobe');
    expect(probe.scheme).toBe('rranker-nativeprobe');
    expect(probe.plugins).toContain('./tests/native/with-account-probe-network.js');
  });
  it('redirects the same Android probe specifier consistently across files', () => {
    const adapter = resolve('tests/native/expo-fetch-adapter.ts');
    const context = { originModulePath: resolve('src/providers/lxns-oauth-request.ts') };
    expect(resolver('expo-router/entry').resolve(context, 'expo/fetch', 'android')).toEqual({ type: 'sourceFile', filePath: '/ordinary.js' });
    const probe = resolver('native-account-recovery-entry.tsx');
    expect(probe.resolve(context, 'expo/fetch', 'android')).toEqual({ type: 'sourceFile', filePath: adapter });
    expect(probe.resolve({ originModulePath: adapter }, 'expo/fetch', 'android')).toEqual({ type: 'sourceFile', filePath: adapter });
    expect(probe.resolve({ originModulePath: adapter }, 'expo/fetch.js', 'android')).toEqual({ type: 'sourceFile', filePath: '/ordinary.js' });
    expect(probe.resolve(context, 'expo/fetch', 'ios')).toEqual({ type: 'sourceFile', filePath: '/ordinary.js' });
  });

  it.each(['probe-first', 'adapter-first'] as const)('uses the actual Metro cache without native-fetch self-import: %s', order => {
    const probe = resolve('tests/native/account-recovery-probe.ts');
    const adapter = resolve('tests/native/expo-fetch-adapter.ts');
    expect(path.dirname(probe)).toBe(path.dirname(adapter));
    const probeSpecifier = fetchSpecifier(probe);
    const adapterSpecifier = fetchSpecifier(adapter);
    expect(probeSpecifier).toBe('expo/fetch');
    expect(adapterSpecifier).toBe('expo/fetch.js');
    const publicNativeFetch = requirePackage.resolve(adapterSpecifier);
    expect(publicNativeFetch).toBe(requirePackage.resolve(probeSpecifier));
    const sources = [{ origin: probe, specifier: probeSpecifier }, { origin: adapter, specifier: adapterSpecifier }];
    if (order === 'adapter-first') sources.reverse();

    for (const main of ['native-account-recovery-entry.tsx', 'expo-router/entry']) {
      const { graph, resolveDependency } = cachedResolver(main);
      const results = new Map<string, Resolution>();
      for (const { origin, specifier } of sources) {
        results.set(origin, graph.resolveDependency(origin, { name: specifier, data: { isESMImport: true } }, 'android', {}));
      }
      expect(results.get(probe)?.filePath).toBe(main === 'expo-router/entry' ? publicNativeFetch : adapter);
      expect(results.get(adapter)?.filePath).toBe(publicNativeFetch);
      expect(results.get(adapter)?.filePath).not.toBe(adapter);
      expect(resolveDependency).toHaveBeenCalledTimes(2);
    }
  });
});

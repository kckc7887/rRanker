import { readFileSync } from 'node:fs';
import path, { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const app = JSON.parse(readFileSync(resolve('app.json'), 'utf8'));
function config(main: string) {
  const module = { exports: {} as typeof app };
  runInNewContext(readFileSync(resolve('app.config.js'), 'utf8'), { module,
    require: (name: string) => name === './app.json' ? app : { main }, process: { env: {} } });
  return module.exports.expo;
}
function resolver(main: string) {
  const module = { exports: {} as { resolver: { resolveRequest: (...args: unknown[]) => unknown } } };
  const nativeResolve = vi.fn().mockReturnValue({ type: 'sourceFile', filePath: '/ordinary.js' });
  const require = Object.assign((name: string) => {
    if (name === 'expo/metro-config') return { getDefaultConfig: () => ({ resolver: { assetExts: [], resolveRequest: nativeResolve } }) };
    if (name === 'path') return path;
    if (name === './package.json') return { main };
    throw new Error(`Unexpected module ${name}`);
  }, { resolve: () => resolve('dependency/zod/package.json') });
  runInNewContext(readFileSync(resolve('metro.config.js'), 'utf8'), { module, require, __dirname: process.cwd() });
  return { resolve: module.exports.resolver.resolveRequest, nativeResolve };
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
  it('redirects only Android probe imports and resolves the adapters own native import normally', () => {
    const adapter = resolve('tests/native/expo-fetch-adapter.ts');
    const context = { originModulePath: resolve('src/providers/lxns-oauth-request.ts') };
    expect(resolver('expo-router/entry').resolve(context, 'expo/fetch', 'android')).toEqual({ type: 'sourceFile', filePath: '/ordinary.js' });
    const probe = resolver('native-account-recovery-entry.tsx');
    expect(probe.resolve(context, 'expo/fetch', 'android')).toEqual({ type: 'sourceFile', filePath: adapter });
    expect(probe.resolve({ originModulePath: adapter }, 'expo/fetch', 'android')).toEqual({ type: 'sourceFile', filePath: '/ordinary.js' });
    expect(probe.resolve(context, 'expo/fetch', 'ios')).toEqual({ type: 'sourceFile', filePath: '/ordinary.js' });
  });
});

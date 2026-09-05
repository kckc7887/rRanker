import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const source = readFileSync(path.resolve('plugins/with-android-abi-splits.js'), 'utf8');
function apply(contents: string) {
  const module = { exports: undefined as unknown };
  vm.runInNewContext(source, {
    module,
    require: (name: string) => name === 'expo/config-plugins' ? {
      createRunOncePlugin: (plugin: unknown) => plugin,
      withAppBuildGradle: (config: unknown, plugin: (config: unknown) => unknown) => plugin(config),
    } : require(name),
  });
  const plugin = module.exports as (config: { modResults: { language: string; contents: string } }) => {
    modResults: { contents: string };
  };
  return plugin({ modResults: { language: 'groovy', contents } }).modResults.contents;
}

describe('Android ABI config plugin', () => {
  it('puts splits directly inside android, independent of the buildTypes closing brace', () => {
    const original = 'android {\n    buildTypes {\n        release {\n        }\n    }\n    packagingOptions {\n    }\n}\n';
    const result = apply(original);
    expect(result.indexOf('    splits {')).toBeLessThan(result.indexOf('    buildTypes {'));
    expect(result).toContain('include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"');
    expect(result).toContain('universalApk false');
    expect(apply(result)).toBe(result);
  });
  it('relocates an existing generated block without duplicating it', () => {
    const generated = apply('android {\n}\n');
    const block = generated.slice(generated.indexOf('// @generated begin'), generated.indexOf('\n}', generated.indexOf('// @generated end')));
    const misplaced = `android {\n    buildTypes {\n${block}\n    }\n}\n`;
    const result = apply(misplaced);
    expect(result.split('    splits {')).toHaveLength(2);
    expect(result.indexOf('    splits {')).toBeLessThan(result.indexOf('    buildTypes {'));
  });
});

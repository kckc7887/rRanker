import { resolve } from 'node:path';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { ExportedConfig, Mod } from 'expo/config-plugins';
import { describe, expect, it } from 'vitest';
import withAndroidAbiSplits from '../plugins/with-android-abi-splits.js';

const app = { name: 'rRanker', slug: 'rranker' };
const template = `android {
    buildTypes {
        release {
            signingConfig signingConfigs.debug
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
        }
    }
    packagingOptions {
        jniLibs { useLegacyPackaging false }
    }
}
`;

async function runMod<T>(mod: Mod<T>, modResults: NoInfer<T>) {
  const result = await mod({
    ...app, modResults, modRawConfig: app,
    modRequest: { projectRoot: process.cwd(), platformProjectRoot: resolve('android'), platform: 'android', modName: 'size-test', introspect: true },
  });
  return result.modResults;
}

function mods(options?: { minify: boolean; shrink: boolean; optimize: boolean }) {
  return (withAndroidAbiSplits({ ...app }, options) as ExportedConfig).mods!.android!;
}

describe('Android release size config plugin', () => {
  it('retains reflective Expo Record annotations without disabling optimization', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'rranker-proguard-test-'));
    try {
      await mkdir(resolve(directory, 'app'));
      const file = resolve(directory, 'app/proguard-rules.pro');
      await writeFile(file, '# existing custom rules\n');
      const mod = mods().dangerous!;
      const config = {
        ...app, modResults: {}, modRawConfig: app,
        modRequest: { projectRoot: process.cwd(), platformProjectRoot: directory, platform: 'android' as const, modName: 'dangerous', introspect: false },
      };
      await mod(config);
      await mod(config);
      const rules = await readFile(file, 'utf8');
      expect(rules).toContain('# existing custom rules');
      expect(rules.match(/-keep @interface expo\.modules\.kotlin\.records\.\*\* \{ \*; \}/g)).toHaveLength(1);
      expect(rules).not.toContain('-dontoptimize');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it.each([
    { minify: false, shrink: false, optimize: false },
    { minify: true, shrink: false, optimize: false },
    { minify: true, shrink: false, optimize: true },
  ])('applies controlled diagnostic settings %j', async (options) => {
    const configured = mods(options);
    const properties = await runMod(configured.gradleProperties!, []);
    expect(properties).toEqual([
      { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: String(options.minify) },
      { type: 'property', key: 'android.enableShrinkResourcesInReleaseBuilds', value: String(options.shrink) },
    ]);
    const result = await runMod(configured.appBuildGradle!, { path: 'app/build.gradle', language: 'groovy', contents: template });
    expect(result.contents).toContain(`getDefaultProguardFile("proguard-android${options.optimize ? '-optimize' : ''}.txt")`);
    expect(await runMod(configured.appBuildGradle!, result)).toEqual(result);
  });

  it('rejects resource shrinking without minification', () => {
    expect(() => mods({ minify: false, shrink: true, optimize: false })).toThrow('optimization');
  });
  it('enables both shrinkers idempotently and preserves unrelated properties', async () => {
    const mod = mods().gradleProperties!;
    const input: Parameters<typeof mod>[0]['modResults'] = [
      { type: 'property', key: 'hermesEnabled', value: 'true' },
      { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' },
      { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' },
    ];
    const first = await runMod(mod, input);
    expect(await runMod(mod, first)).toEqual(first);
    expect(first).toEqual([
      { type: 'property', key: 'hermesEnabled', value: 'true' },
      { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'true' },
      { type: 'property', key: 'android.enableShrinkResourcesInReleaseBuilds', value: 'true' },
    ]);
  });

  it('preserves ABI splits and custom rules while using the optimized ProGuard default', async () => {
    const mod = mods().appBuildGradle!;
    const first = await runMod(mod, { path: 'app/build.gradle', language: 'groovy', contents: template });
    expect(await runMod(mod, first)).toEqual(first);
    expect(first.contents).toContain('proguard-android-optimize.txt');
    expect(first.contents).toContain('"proguard-rules.pro"');
    expect(first.contents).toContain('signingConfig signingConfigs.debug');
    expect(first.contents).toContain('include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"');
    expect(first.contents).toContain('universalApk false');
    expect(first.contents.match(/\bsplits\s*\{/g)).toHaveLength(1);
    expect(first.contents).toMatch(/^android \{\n\/\/ @generated begin[^\n]*\n    splits \{/);
    const existing = { ...first, contents: first.contents.replace('proguard-android-optimize.txt', 'proguard-android.txt') };
    expect((await runMod(mod, existing)).contents).toEqual(first.contents);
  });

  it('fails explicitly when the upstream ProGuard template no longer matches', async () => {
    await expect(runMod(mods().appBuildGradle!, {
      path: 'app/build.gradle', language: 'groovy', contents: 'android {}',
    })).rejects.toThrow('ProGuard');
  });
});

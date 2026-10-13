import { resolve } from 'node:path';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { ExportedConfig, Mod } from 'expo/config-plugins';
import { afterEach, describe, expect, it, vi } from 'vitest';
import withAndroidAbiSplits from '../plugins/with-android-abi-splits.js';
import withArcadeMap from '../plugins/with-arcade-map.js';

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

describe('Android map configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['test-map-key', ''])('configures the native map key without altering other metadata', async key => {
    vi.stubEnv('AMAP_ANDROID_KEY', key);
    const configured = (withArcadeMap({ ...app }) as ExportedConfig).mods!.android!;
    const manifest = { manifest: { $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' }, queries: [], application: [{
      $: { 'android:name': '.MainApplication' },
      'meta-data': [
        { $: { 'android:name': 'existing.setting', 'android:value': 'keep' } },
        { $: { 'android:name': 'com.amap.api.v2.apikey', 'android:value': 'previous-key' } },
      ],
      service: [
        { $: { 'android:name': 'existing.Service' } },
        { $: { 'android:name': 'com.amap.api.location.APSService' } },
      ],
    }] } };
    const result = await runMod(configured.manifest!, manifest);
    expect(result.manifest.application?.[0]['meta-data']).toEqual([
      { $: { 'android:name': 'existing.setting', 'android:value': 'keep' } },
      ...(key ? [{ $: { 'android:name': 'com.amap.api.v2.apikey', 'android:value': key } }] : []),
    ]);
    expect(result.manifest.application?.[0].service).toEqual([{ $: { 'android:name': 'existing.Service' } }]);
    expect(await runMod(configured.manifest!, result)).toEqual(result);
  });
});

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
    const properties = await runMod(configured.gradleProperties!, [
      { type: 'property', key: 'hermesEnabled', value: 'true' },
    ]);
    for (const [key, value] of [
      ['android.enableMinifyInReleaseBuilds', String(options.minify)],
      ['android.enableShrinkResourcesInReleaseBuilds', String(options.shrink)],
      ['expo.useLegacyPackaging', 'true'],
      ['android.enableBundleCompression', 'true'],
      ['hermesEnabled', 'true'],
    ]) {
      expect(properties.flatMap(entry => entry.type === 'property' && entry.key === key ? [entry.value] : [])).toEqual([value]);
    }
    const result = await runMod(configured.appBuildGradle!, { path: 'app/build.gradle', language: 'groovy', contents: template });
    expect(result.contents).toContain(`getDefaultProguardFile("proguard-android${options.optimize ? '-optimize' : ''}.txt")`);
    expect(await runMod(configured.appBuildGradle!, result)).toEqual(result);
  });
  it('enables shrinkers and compression idempotently and preserves unrelated properties', async () => {
    const mod = mods().gradleProperties!;
    const input: Parameters<typeof mod>[0]['modResults'] = [
      { type: 'property', key: 'hermesEnabled', value: 'true' },
      { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' },
      { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' },
      { type: 'property', key: 'expo.useLegacyPackaging', value: 'false' },
      { type: 'property', key: 'android.enableBundleCompression', value: 'false' },
    ];
    const first = await runMod(mod, input);
    const second = await runMod(mod, first);
    for (const properties of [first, second]) {
      for (const key of [
        'hermesEnabled',
        'android.enableMinifyInReleaseBuilds',
        'android.enableShrinkResourcesInReleaseBuilds',
        'expo.useLegacyPackaging',
        'android.enableBundleCompression',
      ]) {
        expect(properties.flatMap(entry => entry.type === 'property' && entry.key === key ? [entry.value] : [])).toEqual(['true']);
      }
    }
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
    const existing = { ...first, contents: first.contents.replace('proguard-android-optimize.txt', 'proguard-android.txt') };
    expect((await runMod(mod, existing)).contents).toEqual(first.contents);
  });

  it('fails explicitly when the upstream ProGuard template no longer matches', async () => {
    await expect(runMod(mods().appBuildGradle!, {
      path: 'app/build.gradle', language: 'groovy', contents: 'android {}',
    })).rejects.toThrow('ProGuard');
  });
});

import { resolve } from 'node:path';
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

function mods() {
  return (withAndroidAbiSplits({ ...app }, undefined) as ExportedConfig).mods!.android!;
}

describe('Android release size config plugin', () => {
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

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditOsuEngineSources, auditOsuPreviewModules, osuPreviewLicenseBanner, osuPreviewLicenseFiles } from '../scripts/lib/osu-preview-build.mjs';

const mobileRoot = process.cwd();
const source = (name: string) => resolve(mobileRoot, 'src', name);
const normalized = (file: string) => readFileSync(file, 'utf8').replaceAll('\r\n', '\n');

describe('osu! player distribution', () => {
  it('rejects imports outside application source and excluded third-party loaders', () => {
    expect(() => auditOsuPreviewModules([
      source('features/osu-chart-preview/webview-player/main.ts'),
      source('features/chart-preview-shared/webview-player/playbackClock.ts'),
    ])).not.toThrow();
    for (const dependency of [
      resolve(mobileRoot, 'external/browser.js'),
      source('features/osu-chart-preview/webview-player/engine/parsers/ReplayParser.ts'),
      source('features/osu-chart-preview/webview-player/engine/parsers/SkinLoader.ts'),
      source('features/osu-chart-preview/webview-player/engine/parsers/BeatmapSetLoader.ts'),
      source('features/osu-chart-preview/webview-player/engine/player/TimeStretch.ts'),
      source('features/osu-chart-preview/webview-player/engine/player/stretchClient.ts'),
      source('features/osu-chart-preview/webview-player/engine/session.ts'),
      source('features/osu-chart-preview/webview-player/assets/hitnormal.wav'),
    ]) expect(() => auditOsuPreviewModules([dependency])).toThrow('Unexpected osu! player dependency');
  });

  it('retains fixed upstream provenance and reviews every integrated engine source', () => {
    const manifest = auditOsuEngineSources();
    expect(manifest.upstream.commit).toBe('a8e5d93210188a6bfb3a0181419df0cf1e9675e7');
    expect(manifest.files.map((file: { path: string }) => file.path)).toEqual(expect.arrayContaining([
      'renderer/FollowpointRenderer.ts', 'renderer/URBarRenderer.ts',
      'rulesets/std/index.ts', 'rulesets/taiko/index.ts',
      'rulesets/catch/index.ts', 'rulesets/mania/index.ts',
    ]));
    for (const file of manifest.files) {
      expect(file.upstreamPath).toBe(`src/${file.path}`);
      expect(file.upstreamSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(file.integratedSha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('ships complete license texts and identical executable assets', () => {
    const expectedHashes: Record<string, string> = {
      'LICENSES/replayviewer-js-MIT.txt': 'd8132fc7352690dd47f9c80fabd0300fad94dc9ebfbbf52dd9aca3f4fa8650e4',
      'LICENSES/danser-go-GPL-3.0.txt': '5c4704f4d20364d99017de927389eaae10b87f9e6163bf79e652821dbbaaae69',
      'LICENSES/osu-MIT.txt': 'a148ce3674c24e5a798410100ce9b68954ad4933224b4cd4b6ace10774626c6c',
    };
    const banner = osuPreviewLicenseBanner();
    for (const name of osuPreviewLicenseFiles) {
      const text = normalized(resolve(mobileRoot, '../..', name));
      expect(banner).toContain(text.trim());
      if (expectedHashes[name]) expect(createHash('sha256').update(text).digest('hex')).toBe(expectedHashes[name]);
    }
    const player = readFileSync(resolve(mobileRoot, 'assets/osu-chart-preview/player.js'));
    expect(player.equals(readFileSync(resolve(mobileRoot, 'assets/osu-chart-preview/player.bundle')))).toBe(true);
    expect(player.toString()).toContain(banner);
    const html = normalized(resolve(mobileRoot, 'assets/osu-chart-preview/index.html'));
    expect(html).toContain('<!--OSU_CHART_PREVIEW_CONFIG-->');
    expect(html.indexOf('./audio-data.js')).toBeLessThan(html.indexOf('./player.js'));
    expect(html.indexOf('<!--OSU_CHART_PREVIEW_CONFIG-->')).toBeLessThan(html.indexOf('./player.js'));
    expect(html).not.toContain('<!--PLAYER_SCRIPT-->');
  });

  it('rebuilds the production dependency closure without stale generated files', () => {
    const output = execFileSync(process.execPath, ['scripts/build-osu-chart-preview.mjs', '--check'], {
      cwd: mobileRoot, encoding: 'utf8', timeout: 30_000,
    });
    expect(output).toContain('verified osu-chart-preview');
  }, 35_000);
});

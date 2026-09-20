import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const mobileRoot = process.cwd();
const normalized = (file: string) => readFileSync(file, 'utf8').replaceAll('\r\n', '\n');

describe('Rizline player distribution', () => {
  it('ships identical executable assets and the config marker before the player script', () => {
    const player = readFileSync(resolve(mobileRoot, 'assets/rizline-chart-preview/player.js'));
    expect(player.equals(readFileSync(resolve(mobileRoot, 'assets/rizline-chart-preview/player.bundle')))).toBe(true);
    const html = normalized(resolve(mobileRoot, 'assets/rizline-chart-preview/index.html'));
    expect(html).toContain('<!--RIZLINE_CHART_PREVIEW_CONFIG-->');
    expect(html.indexOf('src="./chart-data.js"')).toBeLessThan(html.indexOf('src="./music-data.js"'));
    expect(html.indexOf('src="./music-data.js"')).toBeLessThan(html.indexOf('<!--RIZLINE_CHART_PREVIEW_CONFIG-->'));
    expect(html.indexOf('<!--RIZLINE_CHART_PREVIEW_CONFIG-->')).toBeLessThan(html.indexOf('./player.js'));
    expect(html).not.toContain('<!--PLAYER_SCRIPT-->');
  });

  it('rebuilds the production dependency closure without stale generated files', () => {
    const output = execFileSync(process.execPath, ['scripts/build-rizline-chart-preview.mjs', '--check'], {
      cwd: mobileRoot, encoding: 'utf8', timeout: 30_000,
    });
    expect(output).toContain('verified rizline-chart-preview');
  }, 35_000);
});

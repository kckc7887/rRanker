import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const directories = ['maimai-chart-preview', 'phigros-chart-preview', 'osu-chart-preview', 'rizline-chart-preview'];
const files = ['index.html', 'player.js', 'player.bundle'];
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const output = 'build/player-artifacts';
const manifest = { sourceSha, files: [] };
for (const directory of directories) {
  mkdirSync(join(output, directory), { recursive: true });
  for (const file of files) {
    const path = `${directory}/${file}`;
    const contents = readFileSync(join('assets', path));
    copyFileSync(join('assets', path), join(output, path));
    manifest.files.push({ path, bytes: contents.length, sha256: createHash('sha256').update(contents).digest('hex') });
  }
}
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

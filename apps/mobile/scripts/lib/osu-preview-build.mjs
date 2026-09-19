import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = fileURLToPath(new URL('../../', import.meta.url));
const repositoryRoot = path.resolve(mobileRoot, '../..');
const engineRoot = path.join(mobileRoot, 'src/features/osu-chart-preview/webview-player/engine');

export const osuPreviewLicenseFiles = Object.freeze([
  'LICENSE',
  'LICENSES/replayviewer-js-MIT.txt',
  'LICENSES/danser-go-GPL-3.0.txt',
  'LICENSES/osu-MIT.txt',
]);

export function osuPreviewLicenseBanner() {
  const notices = osuPreviewLicenseFiles.map(name => `${name}\n\n${fs.readFileSync(path.join(repositoryRoot, name), 'utf8').replaceAll('\r\n', '\n').trim()}`);
  return `/*!\nrRanker osu! chart preview\n` +
    `replayviewer-js: https://github.com/daladal/replayviewer-js/tree/a8e5d93210188a6bfb3a0181419df0cf1e9675e7\n` +
    `Includes osu! ruleset adaptations and danser-go rendering adaptations.\n` +
    `Modifications by rRanker, 2026-09-19: native resource integration, fixed-speed playback, audio scheduling, flat skin and rendering controls.\n` +
    `GPL-covered portions retain GPLv3 terms within the AGPLv3 combination.\n` +
    `Corresponding source and build scripts: https://github.com/kckc7887/rRanker\n\n` +
    notices.join('\n\n----------------------------------------\n\n') + '\n*/';
}

export function auditOsuPreviewModules(inputs) {
  const sourceRoot = path.join(mobileRoot, 'src');
  for (const input of inputs) {
    const relative = path.relative(sourceRoot, input).replaceAll('\\', '/');
    if (relative.startsWith('../') || path.isAbsolute(relative) ||
      /(?:^|\/)(?:ReplayParser|SkinLoader|BeatmapSetLoader|TimeStretch|stretchClient|stretchWorker|session)\.[cm]?[jt]s$/i.test(relative) ||
      /(?:^|\/)(?:lzma|@soundtouchjs|soundtouch|rosu-pp(?:-js|-web)?|fflate|assets|examples|samples)(?:\/|$)/i.test(relative) ||
      /\.(?:wasm|png|webp|jpe?g|ogg|wav|mp3|mp4|os[krz])$/i.test(relative)) {
      throw new Error(`Unexpected osu! player dependency: ${relative}`);
    }
  }
}

export function auditOsuEngineSources() {
  const manifest = JSON.parse(fs.readFileSync(path.join(engineRoot, 'source-manifest.json'), 'utf8'));
  const actual = fs.readdirSync(engineRoot, { recursive: true }).filter(name => name.endsWith('.ts')).map(name => name.replaceAll('\\', '/')).sort();
  const declared = manifest.files.map(file => file.path).sort();
  if (JSON.stringify(actual) !== JSON.stringify(declared)) throw new Error('osu! engine source manifest does not match the source files');
  for (const file of manifest.files) {
    const text = fs.readFileSync(path.join(engineRoot, file.path), 'utf8').replaceAll('\r\n', '\n');
    if (createHash('sha256').update(text).digest('hex') !== file.integratedSha256) {
      throw new Error(`osu! engine source changed without manifest review: ${file.path}`);
    }
  }
  return manifest;
}

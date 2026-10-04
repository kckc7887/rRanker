import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = fileURLToPath(new URL('../../', import.meta.url));
const repositoryRoot = path.resolve(mobileRoot, '../..');

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

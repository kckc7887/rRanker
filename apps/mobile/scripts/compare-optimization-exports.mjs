import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, sep } from 'node:path';

const [baselineDirectory, candidateDirectory, baselineSha, candidateSha, output = 'build/optimization-size.json'] = process.argv.slice(2);
if (!baselineDirectory || !candidateDirectory || ![baselineSha, candidateSha].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? ''))) {
  throw new Error('Usage: compare-optimization-exports.mjs BASELINE_DIR CANDIDATE_DIR BASELINE_SHA CANDIDATE_SHA [OUTPUT_JSON]');
}
function measure(directory) {
  const root = resolve(directory);
  const read = (name) => {
    const path = resolve(root, name.replaceAll('\\', '/'));
    if (!path.startsWith(root + sep)) throw new Error(`Export path outside root: ${name}`);
    return readFileSync(path);
  };
  const metadata = JSON.parse(read('metadata.json'));
  const assetMap = JSON.parse(read('assetmap.json'));
  const platforms = {};
  for (const platform of ['android', 'ios']) {
    const entry = metadata.fileMetadata[platform];
    if (!entry) throw new Error(`Missing ${platform} export`);
    const resources = new Map();
    const names = new Map();
    for (const asset of entry.assets) {
      const bytes = read(asset.path);
      const digest = createHash('sha256').update(bytes).digest('hex');
      resources.set(digest, { path: asset.path.replaceAll('\\', '/'), ext: asset.ext, bytes: bytes.length, sha256: digest });
      names.set(asset.path.replaceAll('\\', '/').split('/').at(-1), bytes.length);
    }
    const assets = [...resources.values()].sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
    const players = {};
    for (const asset of Object.values(assetMap)) {
      if (asset.name !== 'player' || asset.type !== 'bundle') continue;
      const path = asset.fileSystemLocation.replaceAll('\\', '/');
      const name = path.split('/').at(-1);
      const size = names.get(asset.fileHashes?.[0]);
      if (size !== undefined) players[name] = size;
    }
    if (Object.keys(players).length !== 2) throw new Error(`Both player bundles must remain exported on ${platform}`);
    platforms[platform] = { hermesBytes: read(entry.bundle).length,
      resourceBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0), resourceCount: assets.length, players, assets };
  }
  return platforms;
}
const baseline = measure(baselineDirectory), candidate = measure(candidateDirectory);
const comparison = Object.fromEntries(['android', 'ios'].map((platform) => [platform, {
  hermesDeltaBytes: candidate[platform].hermesBytes - baseline[platform].hermesBytes,
  resourceDeltaBytes: candidate[platform].resourceBytes - baseline[platform].resourceBytes,
  totalDeltaBytes: candidate[platform].hermesBytes + candidate[platform].resourceBytes - baseline[platform].hermesBytes - baseline[platform].resourceBytes,
}]));
const report = { baselineSha, candidateSha,
  accounting: 'Hermes plus resources deduplicated by SHA-256 within each platform. Player bundles are included in resources; source maps are excluded. Not APK/IPA or installed size.',
  baseline, candidate, comparison };
mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
const markdown = [
  '# rRanker export comparison', '', `Baseline: \`${baselineSha}\``, `Candidate: \`${candidateSha}\``, '', report.accounting, '',
  '| Platform | Hermes before | Hermes after | Resources before | Resources after | Total delta |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...Object.keys(comparison).map((platform) => `| ${platform} | ${baseline[platform].hermesBytes} | ${candidate[platform].hermesBytes} | ${baseline[platform].resourceBytes} | ${candidate[platform].resourceBytes} | ${comparison[platform].totalDeltaBytes} |`), '',
].join('\n');
writeFileSync(output.replace(/\.json$/, '.md'), markdown);
console.log(markdown);

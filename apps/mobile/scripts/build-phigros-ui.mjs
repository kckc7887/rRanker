import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), 'rranker-phigros-ui'));
const reference = path.join(root, 'assets/phigros-b30-reference');
const source = path.join(root, 'assets/phigros-best-image');
const files = new Map();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function collect(directory, prefix) {
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const filename = path.join(directory, entry.name);
    const target = prefix + entry.name;
    if (entry.isDirectory()) await collect(filename, target + '/');
    else files.set(target, await fs.readFile(filename));
  }
}

for (const [from, to] of [['b19/b19.css', 'game/b19.css'], ['common/common.css', 'game/common.css'], ['common/theme/snow/snow.css', 'game/snow.css'], ['LICENSE', 'LICENSE']]) {
  files.set(to, await fs.readFile(path.join(reference, from)));
}
await collect(path.join(reference, 'otherimg'), 'game/otherimg/');
await collect(source, '');
const zip = new JSZip();
const entries = [];
for (const [filename, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  zip.file(filename, bytes, { date: new Date('2000-01-01T00:00:00Z'), createFolders: false });
  entries.push({ path: filename, bytes: bytes.length, sha256: digest(bytes) });
}
const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'phigros-ui.zip'), bytes);
const archive = { url: 'https://rranker-phigros-data.cn-nb1.rains3.com/phigros-ui.zip', bytes: bytes.length, sha256: digest(bytes) };
await fs.writeFile(path.join(root, 'src/features/phigros-best-image/phigros-ui-manifest.ts'), `import type { UiManifestEntry } from '@/features/best-image/best-image-ui-cache';\n\nexport const PHIGROS_UI_ZIP = ${JSON.stringify(archive, null, 2)} as const;\n\nexport const PHIGROS_UI_ENTRIES: readonly UiManifestEntry[] = ${JSON.stringify(entries, null, 2)};\n`);
console.log(JSON.stringify({ path: path.join(output, 'phigros-ui.zip'), ...archive, files: entries.length }));

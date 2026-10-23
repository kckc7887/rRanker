import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) throw new Error('请提供 Phigros 应用素材 ZIP 路径');
const output = path.resolve(process.argv[3] ?? path.join(os.tmpdir(), 'rranker-phigros-app'));
const source = await JSZip.loadAsync(await fs.readFile(input));
const files = new Map();
for (const entry of Object.values(source.files)) {
  if (!entry.dir) files.set(entry.name, await entry.async('nodebuffer'));
}
for (const name of await fs.readdir(path.join(root, 'assets/phigros-best-image/app'))) {
  files.set(`assets/${name}`, await fs.readFile(path.join(root, 'assets/phigros-best-image/app', name)));
}
const paths = [
  ...['EZ', 'HD', 'IN', 'AT', 'mask'].map(name => `assets/card/${name}.svg`),
  ...Array.from({ length: 6 }, (_, index) => `assets/challenge/outline/${index}.svg`),
  ...['outline', 'avatar-outline', 'divider'].map(name => `assets/header/${name}.svg`),
  ...['phi', 'FC', 'V', 'S', 'A', 'B', 'C', 'F', 'NEW'].map(name => `assets/${name}.svg`),
  'assets/data.png', 'assets/SourceHanSansCN-Bold.otf',
];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const entries = paths.sort().map(name => {
  const bytes = files.get(name);
  if (!bytes) throw new Error(`素材包缺少 ${name}`);
  return { path: name, targetPath: name.replace(/^assets\//u, 'app/'), bytes: bytes.length, sha256: digest(bytes) };
});
const zip = new JSZip();
for (const [name, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  zip.file(name, bytes, { date: new Date('2000-01-01T00:00:00Z'), createFolders: false });
}
const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'phigros-morden-ui.zip'), bytes);
const archive = { url: 'https://rranker-phigros-data.cn-nb1.rains3.com/phigros-morden-ui.zip', bytes: bytes.length, sha256: digest(bytes) };
await fs.writeFile(path.join(root, 'src/features/phigros-best-image/phigros-app-ui-manifest.ts'), `import type { UiManifestEntry } from '@/features/best-image/best-image-ui-cache';\n\nexport const PHIGROS_APP_UI_ZIP = ${JSON.stringify(archive, null, 2)} as const;\n\nexport const PHIGROS_APP_UI_ENTRIES: readonly UiManifestEntry[] = ${JSON.stringify(entries, null, 2)};\n`);
console.log(JSON.stringify({ path: path.join(output, 'phigros-morden-ui.zip'), ...archive, files: entries.length }));

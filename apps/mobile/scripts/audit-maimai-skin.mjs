import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const manifest = await fs.readFile(path.join(root, 'src/features/maimai-chart-preview/maimai-chart-preview-skin-manifest.generated.ts'), 'utf8');
const base = manifest.match(/'https:[^']+'/)[0].slice(1, -1);
const paths = [...manifest.matchAll(/"?path"?:\s*"([^"]+)"/g)].map(m => m[1]);
if (paths.length === 0) throw new Error('Empty skin manifest');
const output = path.join(root, 'build/maimai-skin-audit');
await fs.mkdir(output, { recursive: true });
let next = 0;
const results = [];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < paths.length) {
    const key = paths[next++];
    const file = path.join(output, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const response = await fetch(`${base}/${key}`);
    if (!response.ok) throw new Error(`${key}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(file, bytes);
    const metadata = await sharp(bytes).metadata();
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width, top = info.height, right = -1, bottom = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 0) {
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
    results.push({ path: key, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), width: metadata.width, height: metadata.height, alphaBounds: [left, top, right, bottom] });
  }
}));
results.sort((a, b) => a.path.localeCompare(b.path));
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(results, null, 2));
const soundResponse = await fetch(`${base}/answer.wav`);
if (!soundResponse.ok) throw new Error(`answer.wav: ${soundResponse.status}`);
const sound = Buffer.from(await soundResponse.arrayBuffer());
if (sound.toString('ascii', 0, 4) !== 'RIFF' || sound.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid answer WAV');
await fs.writeFile(path.join(output, 'answer.wav'), sound);
await fs.writeFile(path.join(output, 'answer.json'), JSON.stringify({ path: 'answer.wav', bytes: sound.length, sha256: createHash('sha256').update(sound).digest('hex') }, null, 2));
for (let page = 0; page * 40 < results.length; page++) {
  const entries = results.slice(page * 40, (page + 1) * 40);
  const composite = [];
  for (let i = 0; i < entries.length; i++) {
    const item = entries[i], x = (i % 5) * 260, y = Math.floor(i / 5) * 180;
    const thumbnail = await sharp(path.join(output, item.path)).resize(240, 120, { fit: 'inside' }).png().toBuffer();
    composite.push({ input: thumbnail, left: x + 10, top: y + 5 });
    const [dir, name] = item.path.includes('/') ? item.path.split('/') : ['', item.path];
    const label = `<svg width="260" height="50"><style>text{font:12px monospace;fill:white}</style><text x="8" y="14">${dir}</text><text x="8" y="29">${name}</text><text x="8" y="44">${item.width}x${item.height}</text></svg>`;
    composite.push({ input: Buffer.from(label), left: x, top: y + 125 });
  }
  await sharp({ create: { width: 1300, height: Math.ceil(entries.length / 5) * 180, channels: 4, background: '#262b36' } }).composite(composite).png().toFile(path.join(output, `contact-${page + 1}.png`));
}
console.log(JSON.stringify({ count: results.length, bytes: results.reduce((s, r) => s + r.bytes, 0), output }));

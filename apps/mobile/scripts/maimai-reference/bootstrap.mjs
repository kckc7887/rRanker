import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
const commit = '334f3b4141cbc204814bccb9f3e1cea7c1b14594';
const zipSha = 'cbbb4ab1a777db3702de2e167426364180a70a7343a2686ede96733936c74fd3';
const root = path.resolve(import.meta.dirname, '../../build/maimai-reference');
await fs.mkdir(root, { recursive: true });
const zipFile = path.join(root, 'majsimai.zip');
let bytes;
try { bytes = await fs.readFile(zipFile); } catch {
  const response = await fetch(`https://codeload.github.com/LingFeng-bbben/MajSimai/zip/${commit}`);
  if (!response.ok) throw new Error(`MajSimai archive: ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
if (createHash('sha256').update(bytes).digest('hex') !== zipSha) throw new Error('Pinned MajSimai archive hash mismatch');
await fs.writeFile(zipFile, bytes);
const zip = await JSZip.loadAsync(bytes);
for (const file of Object.values(zip.files)) {
  if (file.dir || !file.name.startsWith(`MajSimai-${commit}/Runtime/`)) continue;
  const target = path.resolve(root, file.name);
  if (!target.startsWith(root + path.sep)) throw new Error('Archive path escaped output');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, await file.async('nodebuffer'));
}
console.log(`Verified MajSimai ${commit}`);

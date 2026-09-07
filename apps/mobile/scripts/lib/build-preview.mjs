import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

export async function buildPreview(sourceName, assetName, marker, scripts) {
  const source = path.join(root, 'src/features', sourceName, 'webview-player');
  const output = path.join(root, 'assets', assetName);
  const result = await build({
    entryPoints: [path.join(source, 'main.ts')], outfile: path.join(output, 'player.js'),
    bundle: true, write: false, format: 'iife', platform: 'browser', target: ['es2020'],
    minify: true, sourcemap: false, logLevel: 'silent',
  });
  const template = fs.readFileSync(path.join(source, 'index.html'), 'utf8').replaceAll('\r\n', '\n');
  if (!template.includes(marker) || !template.includes('<!--PLAYER_SCRIPT-->')) {
    throw new Error('index.html template missing config/player markers');
  }
  const files = new Map([
    ['player.js', result.outputFiles[0].contents],
    ['player.bundle', result.outputFiles[0].contents],
    ['index.html', Buffer.from(template.replace('<!--PLAYER_SCRIPT-->', scripts))],
  ]);
  const check = process.argv.includes('--check');
  if (!check) fs.mkdirSync(output, { recursive: true });
  for (const [name, contents] of files) {
    const file = path.join(output, name);
    if (check) {
      const actual = fs.readFileSync(file);
      const normalized = name.endsWith('.html') ? Buffer.from(actual.toString().replaceAll('\r\n', '\n')) : actual;
      if (!normalized.equals(Buffer.from(contents))) throw new Error(`Stale generated asset: ${file}`);
    } else fs.writeFileSync(file, contents);
  }
  console.log(`${check ? 'verified' : 'built'} ${assetName}: ${result.outputFiles[0].contents.length} bytes`);
}

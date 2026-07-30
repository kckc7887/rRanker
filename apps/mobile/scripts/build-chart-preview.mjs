/**
 * 将谱面预览 WebView 播放器打包为自包含 index.html（内联 player 脚本）。
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptDir, '..');
const entry = path.join(root, 'src/features/maimai-chart-preview/webview-player/main.ts');
const htmlTemplate = path.join(root, 'src/features/maimai-chart-preview/webview-player/index.html');
const outDir = path.join(root, 'assets/maimai-chart-preview');
const outHtml = path.join(outDir, 'index.html');
const outPlayer = path.join(outDir, 'player.js');

fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  outfile: outPlayer,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  sourcemap: false,
  logLevel: 'info',
});

const playerJs = fs.readFileSync(outPlayer, 'utf8');
let html = fs.readFileSync(htmlTemplate, 'utf8');
if (!html.includes('<!--PLAYER_SCRIPT-->')) {
  throw new Error('index.html template missing <!--PLAYER_SCRIPT--> marker');
}
html = html.replace(
  '<!--PLAYER_SCRIPT-->',
  `<script>\n${playerJs}\n</script>`,
);
fs.writeFileSync(outHtml, html, 'utf8');
// 保留 player.js 便于调试；运行时以内联 HTML 为准。
console.log(`built ${outHtml} (${Math.round(Buffer.byteLength(html) / 1024)}kb)`);

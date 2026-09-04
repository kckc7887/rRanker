/**
 * 将谱面预览 WebView 播放器打包为 HTML + 独立 player.bundle（避免 file:// 内联大脚本）。
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
const outPlayerJs = path.join(outDir, 'player.js');
const outPlayerBundle = path.join(outDir, 'player.bundle');

fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  outfile: outPlayerJs,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  sourcemap: false,
  logLevel: 'info',
});

let html = fs.readFileSync(htmlTemplate, 'utf8');
if (!html.includes('<!--CHART_PREVIEW_CONFIG-->') || !html.includes('<!--PLAYER_SCRIPT-->')) {
  throw new Error('index.html template missing config/player markers');
}
html = html
  .replace('<!--CHART_PREVIEW_CONFIG-->', '<!--CHART_PREVIEW_CONFIG-->')
  .replace('<!--PLAYER_SCRIPT-->', '<script src="./skin-data.js"></script>\n  <script src="./player.js"></script>');
fs.writeFileSync(outHtml, html, 'utf8');
fs.copyFileSync(outPlayerJs, outPlayerBundle);

console.log(
  `built ${outHtml} + ${path.basename(outPlayerBundle)} (${Math.round(fs.statSync(outPlayerBundle).size / 1024)}kb)`,
);

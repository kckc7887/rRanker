import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

const sharedPlayer = path.join(root, 'src/features/chart-preview-shared/webview-player');
const transportPaths = {
  'restart': '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 014-4h12"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 01-4 4H5"/>',
  'prev-measure': '<polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>',
  'step-back': '<polyline points="15 18 9 12 15 6"/>',
  'step-forward': '<polyline points="9 18 15 12 9 6"/>',
  'next-measure': '<polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>',
  'fullscreen': '<path d="M8 3H5a2 2 0 00-2 2v3"/><path d="M21 8V5a2 2 0 00-2-2h-3"/><path d="M3 16v3a2 2 0 002 2h3"/><path d="M16 21h3a2 2 0 002-2v-3"/>',
};

function transportControls(measures, fullscreen = false) {
  const disabled = measures ? '' : ' disabled';
  function button(id, label, caption, title = '') {
    const prefix = fullscreen ? 'fs' : 'btn';
    return `<button class="transport-btn" id="${prefix}-${id}" data-control-label="${caption}" type="button" aria-label="${label}"${title}${disabled}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${transportPaths[id]}</svg>
    </button>`;
  }
  const playID = fullscreen ? 'fs-play' : measures ? 'play' : 'play-button';
  const group = fullscreen ? 'class="row transport-group" id="fs-transport"'
    : `class="row transport-group preview-transport${measures ? ' has-measures' : ''}"`;
  return `<div ${group}>
    <div class="transport-side left">
      ${button('restart', measures ? '重播当前小节' : '重播', measures ? '本节重播' : '重播')}
      ${measures ? button('prev-measure', '上一小节', '上一节') : ''}
      ${button('step-back', '步退', measures ? '退一拍' : '退 5 秒')}
    </div>
    <button id="${playID}" ${fullscreen ? 'class="transport-btn play-toggle" ' : ''}type="button" aria-label="播放"${disabled}>
      <svg viewBox="0 0 24 24" fill="currentColor"><path class="play-icon" d="M8 5v14l11-7z"/><path class="pause-icon" d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
    </button>
    <div class="transport-side right">
      ${button('step-forward', '步进', measures ? '进一拍' : '进 5 秒')}
      ${measures ? button('next-measure', '下一小节', '下一节') : ''}
      ${button('fullscreen', fullscreen ? '退出全屏' : measures ? '全屏' : '进入全屏', '全屏', measures ? '' : ' title="全屏"')}
    </div>
  </div>`;
}

function previewControls({ settings, details, measures, seekSlider }) {
  const measure = measures ? '<span class="preview-measure">小节 <span id="timeline-badge"></span></span>' : '';
  const timelineAttrs = seekSlider
    ? ' role="slider" tabindex="0" aria-label="播放进度" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-disabled="true"'
    : '';
  return `<div class="preview-scroll">
    <section id="controls" aria-label="播放控制">
      <div class="row preview-time-row">
        <div class="preview-time-heading"><span class="preview-position-label">播放详情</span>${measure}</div>
        <span id="time-label">0:00 / 0:00</span>
      </div>
${details ? `      <div class="preview-details" aria-label="谱面实时信息">${details}</div>\n` : ''}      <div class="row preview-timeline-row"><div id="timeline-host"${timelineAttrs}>
        <div id="timeline-bars"></div><div id="timeline-ruler"></div><div id="timeline-playhead"></div>${measure ? '' : '<div id="timeline-badge"></div>'}
      </div></div>
      ${transportControls(measures)}
      <div class="row loop-row">
        <button class="loop-btn" id="btn-loop-a" type="button">A —</button>
        <span class="loop-sep">⇌</span>
        <button class="loop-btn" id="btn-loop-b" type="button">B —</button>
      </div>
      <section class="preview-settings controls-settings" aria-label="参数与效果">
        <h2>参数与效果</h2>${settings}
      </section>
    </section>
  </div>`;
}

export function readPreviewTemplate(sourceName) {
  const source = path.join(root, 'src/features', sourceName, 'webview-player/index.html');
  const template = fs.readFileSync(source, 'utf8');
  const details = template.match(/<template id="preview-details">([\s\S]*?)<\/template>/);
  return (details ? template.replace(details[0], '') : template)
    .replace('/*PREVIEW_CONTROLS_STYLE*/', () => fs.readFileSync(path.join(sharedPlayer, 'controls.css'), 'utf8'))
    .replace(/<template id="preview-settings"([^>]*)>([\s\S]*?)<\/template>/, (_, options, settings) =>
      previewControls({ settings, details: details?.[1], measures: options.includes('data-measures'), seekSlider: options.includes('data-seek-slider') }))
    .replace('<!--PREVIEW_FULLSCREEN_TRANSPORT-->', () => transportControls(true, true))
    .replace('<!--PREVIEW_LOCK-->', `<button id="fs-lock" type="button" aria-label="锁定">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
  </button>`)
    .replace('/*PREVIEW_STAGE_STYLE*/', () => fs.readFileSync(path.join(sharedPlayer, 'stage-player.css'), 'utf8'))
    .replace('/*PREVIEW_STYLE*/', () => fs.readFileSync(path.join(sharedPlayer, 'player.css'), 'utf8'))
    .replace(/<!--PREVIEW_WHEEL ([\w-]+)\|([^|<>]*)\|([^<>]*)-->/g, (_, id, wheelAttrs, viewportAttrs) =>
      `<div class="wheel-popup" id="${id}-popup" style="visibility:hidden;pointer-events:none">
        <div class="wheel" ${wheelAttrs}>
          <div class="wheel-viewport" id="${id}-wheel" ${viewportAttrs}><div class="wheel-list" id="${id}-list"></div></div>
          <div class="wheel-highlight"></div>
        </div>
      </div>`)
    .replaceAll('\r\n', '\n').replace(/[ \t]+$/gm, '');
}

export function readGeneratedPreview(assetName) {
  const output = path.join(root, 'assets', assetName);
  return {
    html: fs.readFileSync(path.join(output, 'index.html'), 'utf8'),
    script: fs.readFileSync(path.join(output, 'player.bundle')),
  };
}

export async function buildPreview(sourceName, assetName, marker, scripts, options = {}) {
  const source = path.join(root, 'src/features', sourceName, 'webview-player');
  const output = path.join(root, 'assets', assetName);
  const result = await build({
    entryPoints: [path.join(source, 'main.ts')], outfile: path.join(output, 'player.js'),
    bundle: true, write: false, format: 'iife', platform: 'browser', target: ['es2020'],
    minify: true, sourcemap: false, logLevel: 'silent',
    ...(options.licenseBanner ? { banner: { js: options.licenseBanner } } : {}),
  });
  const template = readPreviewTemplate(sourceName);
  if (!template.includes(marker) || !template.includes('<!--PLAYER_SCRIPT-->')) {
    throw new Error('index.html template missing config/player markers');
  }
  const files = new Map([
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

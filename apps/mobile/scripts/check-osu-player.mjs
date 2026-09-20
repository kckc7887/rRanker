import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const imported = process.argv[2] ? await import(pathToFileURL(path.resolve(process.argv[2])).href) : await import('playwright');
const { chromium } = imported.default ?? imported;
const [html, player, helpers] = await Promise.all([
  fs.readFile(path.join(root, 'src/features/osu-chart-preview/webview-player/index.html'), 'utf8'),
  build({ entryPoints: [path.join(root, 'src/features/osu-chart-preview/webview-player/main.ts')], bundle: true, write: false, format: 'iife', platform: 'browser' }),
  build({ stdin: { contents: `
    export { PreviewBackgroundBlur } from './background-blur';
    export { createPreviewMedia } from './backdrop';
    export { createBuiltinSkin, disposeBuiltinSkins } from './builtin-skin';
    export { parseBeatmap, computeModDifficulty } from './engine';
    export { buildAutoReplay } from './autoplay';
    export { catchRuleset } from './engine/rulesets/catch/index';
  `, resolveDir: path.join(root, 'src/features/osu-chart-preview/webview-player'), loader: 'ts' },
  bundle: true, write: false, format: 'iife', globalName: 'OsuVisualCheck', platform: 'browser' }),
]);

function fixture(mode) {
  return `osu file format v14
[General]
AudioFilename: music.wav
Mode: ${mode}
[Metadata]
Title: Playback verification
Artist: rRanker
Creator: rRanker
Version: Test
[Difficulty]
HPDrainRate: 5
CircleSize: ${mode === 3 ? 4 : 5}
OverallDifficulty: 5
ApproachRate: 5
SliderMultiplier: 1.4
SliderTickRate: 1
[TimingPoints]
0,500,4,1,0,100,1,0
[HitObjects]
256,192,3000,1,0,0:0:0:0:
256,192,7000,1,0,0:0:0:0:
`;
}

function wav(seconds) {
  const bytes = Buffer.alloc(44 + seconds * 8000 * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes.toString('base64');
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=document-user-activation-required'] });
const results = [];
try {
  const visualPage = await browser.newPage();
  await visualPage.setContent('<!doctype html><html><body></body></html>');
  await visualPage.addScriptTag({ content: helpers.outputFiles[0].text });
  const pixels = await visualPage.evaluate(async (catchChart) => {
    const { PreviewBackgroundBlur, createPreviewMedia, createBuiltinSkin, disposeBuiltinSkins, parseBeatmap, computeModDifficulty, buildAutoReplay, catchRuleset } = OsuVisualCheck;
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const canvas = (width = 1280, height = 720) => Object.assign(document.createElement('canvas'), { width, height });
    const source = canvas(), sourceContext = source.getContext('2d');
    sourceContext.fillStyle = '#000'; sourceContext.fillRect(0, 0, 1280, 720);
    sourceContext.fillStyle = '#fff'; sourceContext.fillRect(0, 0, 640, 720);
    const filterDescriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'filter');
    const render = (radius, quality, unavailable, axis) => {
      const target = canvas(1280 * quality, 720 * quality), ctx = target.getContext('2d');
      ctx.scale(quality, quality);
      if (unavailable === 'absent') delete CanvasRenderingContext2D.prototype.filter;
      if (unavailable === 'ignored') Object.defineProperty(CanvasRenderingContext2D.prototype, 'filter', { configurable: true, get: () => 'none', set() {} });
      const blur = new PreviewBackgroundBlur();
      try { blur.draw(ctx, source, radius, 1); }
      finally { Object.defineProperty(CanvasRenderingContext2D.prototype, 'filter', filterDescriptor); blur.dispose(); }
      const reach = Math.ceil(radius * 4 + quality * 3);
      const row = axis === 'vertical'
        ? ctx.getImageData(640 * quality - reach, 360 * quality, reach * 2 + 1, 1).data
        : ctx.getImageData(640 * quality, 360 * quality - reach, 1, reach * 2 + 1).data;
      const values = Array.from({ length: reach * 2 + 1 }, (_, index) => row[index * 4]);
      const width = values.filter(value => value > 25 && value < 230).length;
      check(values[0] >= 248 && values.at(-1) <= 3, 'blur must preserve flat colours away from the edge');
      check(width > 0, 'blur must produce actual intermediate pixels');
      target.width = target.height = 0;
      return { values, width };
    };
    const comparisons = [];
    for (const axis of ['vertical', 'horizontal']) for (const unavailable of ['absent', 'ignored']) for (const quality of [1, 2, 3]) {
      sourceContext.fillStyle = '#000'; sourceContext.fillRect(0, 0, 1280, 720);
      sourceContext.fillStyle = '#fff'; sourceContext.fillRect(0, 0, axis === 'vertical' ? 640 : 1280, axis === 'vertical' ? 720 : 360);
      let lastWidth = 0;
      for (const radius of [1, 10, 20]) {
        const native = render(radius, quality, undefined, axis), fallback = render(radius, quality, unavailable, axis);
        const meanError = native.values.reduce((sum, value, index) => sum + Math.abs(value - fallback.values[index]), 0) / native.values.length;
        check(meanError < 12, `fallback edge differs from native blur: ${unavailable}/${quality}/${radius}: ${meanError}`);
        check(Math.abs(native.width - fallback.width) <= Math.max(4, native.width * 0.25), 'fallback radius must retain output-pixel semantics');
        check(fallback.width >= lastWidth, 'increasing blur must not sharpen the edge');
        lastWidth = fallback.width;
        comparisons.push({ axis, unavailable, quality, radius, meanError, nativeWidth: native.width, fallbackWidth: fallback.width });
      }
    }
    sourceContext.clearRect(0, 0, 1280, 720);
    sourceContext.fillStyle = '#4080c080'; sourceContext.fillRect(0, 0, 1280, 720);
    const translucent = canvas(), translucentContext = translucent.getContext('2d');
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'filter', { configurable: true, get: () => 'none', set() {} });
    const translucentBlur = new PreviewBackgroundBlur();
    try { translucentBlur.draw(translucentContext, source, 20, 1); }
    finally { Object.defineProperty(CanvasRenderingContext2D.prototype, 'filter', filterDescriptor); translucentBlur.dispose(); }
    const translucentPixel = [...translucentContext.getImageData(640, 360, 1, 1).data];
    check(translucentPixel.every((value, index) => Math.abs(value - [64, 128, 192, 128][index]) <= 4), `blur must preserve premultiplied colour and alpha: ${translucentPixel}`);
    translucent.width = translucent.height = 0;
    sourceContext.fillStyle = '#000'; sourceContext.fillRect(0, 0, 1280, 720);
    sourceContext.fillStyle = '#fff'; sourceContext.fillRect(0, 0, 640, 720);

    const overlay = canvas(32, 32), overlayContext = overlay.getContext('2d');
    overlayContext.fillStyle = '#ff0000'; overlayContext.fillRect(0, 0, 32, 32);
    const settings = { backgroundBlur: 20, backgroundBrightness: 100, storyboardEnabled: true, videoEnabled: true };
    const media = await createPreviewMedia({ files: new Map([
      ['background.png', { uri: source.toDataURL() }], ['overlay.png', { uri: overlay.toDataURL() }],
    ]), osuPath: 'map.osu', osuBytes: new TextEncoder().encode('[Events]\n0,0,"background.png",0,0\nSprite,Overlay,Centre,"overlay.png",320,240\n F,0,0,5000,1'),
    signal: new AbortController().signal, onWarning(message) { throw new Error(message); }, onInvalidate() {} });
    const target = canvas(), context = target.getContext('2d');
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'filter', { configurable: true, get: () => 'none', set() {} });
    const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
    const originalCreate = document.createElement.bind(document);
    const scratch = [];
    let draws = 0;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) { draws++; return originalDraw.apply(this, args); };
    document.createElement = function (...args) { const element = originalCreate(...args); if (args[0] === 'canvas') scratch.push(element); return element; };
    try {
      media.configure(settings); media.drawUnder(context, 1000);
      const before = draws;
      media.drawUnder(context, 1000);
      check(draws - before === 1, 'same-frame fallback must reuse its filtered surface');
      media.drawOver(context, 1000);
      const edge = context.getImageData(640, 300, 1, 1).data;
      const red = context.getImageData(640, 360, 1, 1).data;
      check(edge[0] > 80 && edge[0] < 180, 'background pixels must be blurred');
      check(red[0] === 255 && red[1] === 0 && red[2] === 0, 'Overlay must stay sharp and undimmed');
      media.configure({ ...settings, backgroundBrightness: 50 });
      media.drawUnder(context, 1000); media.drawOver(context, 1000);
      check(context.getImageData(640, 300, 1, 1).data[0] < edge[0] * 0.6, 'brightness applies after background blur');
      check(context.getImageData(640, 360, 1, 1).data[0] === 255, 'brightness must not dim Overlay');
      media.configure({ ...settings, backgroundBlur: 0 });
      context.clearRect(0, 0, 1280, 720); media.drawUnder(context, 1000);
      check(context.getImageData(639, 300, 1, 1).data[0] === 255 && context.getImageData(640, 300, 1, 1).data[0] === 0, 'zero blur restores the sharp background immediately');
    } finally {
      media.dispose();
      CanvasRenderingContext2D.prototype.drawImage = originalDraw;
      document.createElement = originalCreate;
      Object.defineProperty(CanvasRenderingContext2D.prototype, 'filter', filterDescriptor);
    }
    check(scratch.every(item => item.width * item.height === 0), 'all background and blur surfaces must be released');

    const skin = await createBuiltinSkin('brick', 4), sprite = canvas(256, 256), spriteContext = sprite.getContext('2d');
    const alphas = [];
    for (const stem of ['fruit-pear', 'fruit-grapes', 'fruit-apple', 'fruit-orange', 'fruit-drop', 'fruit-bananas']) {
      spriteContext.clearRect(0, 0, 256, 256); spriteContext.drawImage(skin.images.get(`${stem}@2x.png`), 0, 0);
      const centre = spriteContext.getImageData(128, 128, 1, 1).data[3], outside = spriteContext.getImageData(0, 0, 1, 1).data[3];
      check(centre === 128 && outside === 0, `${stem} must be a translucent filled disc`);
      alphas.push({ stem, centre, outside });
    }
    const beatmap = parseBeatmap(catchChart), replay = buildAutoReplay(new TextEncoder().encode(catchChart), '');
    const session = catchRuleset.build(beatmap, replay, computeModDifficulty(beatmap, replay), skin, 1);
    context.clearRect(0, 0, 1280, 720);
    catchRuleset.draw(context, session, 2400, { modHidden: false, modFlashlight: false });
    const tinted = context.getImageData(640, 320, 1, 1).data;
    check(tinted[3] === 128, `engine tinting must preserve half alpha: ${tinted[3]}`);
    check(context.getImageData(640, 630, 1, 1).data[3] === 255, 'catcher must remain opaque');
    await disposeBuiltinSkins();
    for (const item of [source, overlay, target, sprite]) item.width = item.height = 0;
    return { comparisons, translucentPixel, alphas, tintedAlpha: tinted[3] };
  }, fixture(2));
  results.push({ pixels });
  await visualPage.close();

  for (const mode of [0, 1, 2, 3]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.messages = []; window.resumes = 0; window.starts = 0;
      window.ReactNativeWebView = { postMessage: text => window.messages.push(JSON.parse(text)) };
      const resume = AudioContext.prototype.resume, start = AudioBufferSourceNode.prototype.start;
      AudioContext.prototype.resume = function (...args) { window.resumes++; return resume.apply(this, args); };
      AudioBufferSourceNode.prototype.start = function (...args) { window.starts++; return start.apply(this, args); };
    });
    const config = { theme: 'dark', requestedMode: mode, chartPath: 'map.osu', files: [{ path: 'map.osu', mime: 'text/plain', text: fixture(mode) }], settings: {} };
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.endsWith('/player.js')) return route.fulfill({ contentType: 'text/javascript', body: player.outputFiles[0].text });
      if (url.endsWith('/index.html')) return route.fulfill({ contentType: 'text/html', body: html
        .replace('<!--OSU_CHART_PREVIEW_CONFIG-->', `<script>window.__OSU_CHART_PREVIEW_CONFIG__=${JSON.stringify(config)};window.__OSU_PREVIEW_AUDIO__={"music.wav":"${wav(20)}"};</script>`)
        .replace('<!--PLAYER_SCRIPT-->', '<script src="./player.js"></script>') });
      return route.abort();
    });
    await page.goto('https://preview.test/index.html');
    await page.waitForFunction(() => window.messages.some(message => message.type === 'ready' || message.type === 'error'));
    assert.equal(await page.evaluate(() => window.messages.some(message => message.type === 'ready')), true, JSON.stringify(await page.evaluate(() => window.messages)));
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#play-button').getAttribute('aria-label'), '播放');
    assert.deepEqual(await page.evaluate(() => [window.resumes, window.starts]), [0, 0], 'preparation must not resume audio or start sources');
    assert.equal(await page.locator('#timeline-host').getAttribute('aria-valuenow'), '0');
    await page.locator('#btn-step-forward').click();
    await page.waitForFunction(() => Number(document.querySelector('#timeline-host').getAttribute('aria-valuenow')) === 5000);
    assert.deepEqual(await page.evaluate(() => [window.resumes, window.starts]), [0, 0], 'paused seek must remain silent');
    await page.locator('#play-button').click();
    await page.waitForFunction(() => window.resumes > 0 && window.starts > 0 && document.querySelector('#play-button').getAttribute('aria-label') === '暂停');
    await page.waitForFunction(() => Number(document.querySelector('#timeline-host').getAttribute('aria-valuenow')) > 5100);
    await page.locator('#play-button').click();
    const paused = await page.locator('#timeline-host').getAttribute('aria-valuenow');
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#timeline-host').getAttribute('aria-valuenow'), paused);
    await page.locator('#btn-restart').click();
    await page.waitForFunction(() => document.querySelector('#play-button').getAttribute('aria-label') === '暂停' && Number(document.querySelector('#timeline-host').getAttribute('aria-valuenow')) < 1000);
    await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'stop' }) })));
    await page.waitForFunction(() => document.querySelector('#play-button').getAttribute('aria-label') === '播放');
    const stopped = await page.locator('#timeline-host').getAttribute('aria-valuenow');
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#timeline-host').getAttribute('aria-valuenow'), stopped);
    assert.deepEqual(errors, []);
    results.push({ mode, readyPaused: true, silentSeek: true, playPauseRestart: true, lifecyclePaused: true });
    await page.close();
  }
  console.log(JSON.stringify({ passed: true, results }, null, 2));
} finally {
  await browser.close();
}

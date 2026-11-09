import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { readGeneratedPreview, readPreviewTemplate } from './lib/build-preview.mjs';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const generated = args.includes('--generated');
const positional = args.filter(arg => arg !== '--generated');
const playwright = positional[0] ? pathToFileURL(path.resolve(positional[0])).href : 'playwright';
const imported = await import(playwright);
const { chromium } = imported.default ?? imported;
const packaged = generated ? readGeneratedPreview('osu-chart-preview') : null;
const [html, player, helpers] = packaged ? [packaged.html, packaged.script.toString('utf8'), null] : await Promise.all([
  readPreviewTemplate('osu-chart-preview'),
  build({ stdin: { contents: "import './main'; export { Renderer } from './engine'; export { getAudioContext } from './playback';",
    resolveDir: path.join(root, 'src/features/osu-chart-preview/webview-player'), loader: 'ts' },
    bundle: true, write: false, format: 'iife', globalName: 'OsuPlayerCheck', platform: 'browser' }).then(result => result.outputFiles[0].text),
  build({ stdin: { contents: `
    export { createStageContext } from '../../chart-preview-shared/webview-player/stage';
    export { drawTrack } from '../../chart-preview-shared/webview-player/stage-track';
    export { createPreviewMedia } from './backdrop';
    export { createBuiltinSkin, disposeBuiltinSkins } from './builtin-skin';
    export { parseBeatmap, computeModDifficulty } from './engine';
    export { buildAutoReplay } from './autoplay';
    export { catchRuleset } from './engine/rulesets/catch/index';
    export { taikoRuleset } from './engine/rulesets/taiko/index';
  `, resolveDir: path.join(root, 'src/features/osu-chart-preview/webview-player'), loader: 'ts' },
  bundle: true, write: false, format: 'iife', globalName: 'OsuVisualCheck', platform: 'browser' }).then(result => result.outputFiles[0].text),
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

function denseFixture(mode) {
  const notes = Array.from({ length: 30 }, (_, i) => {
    const x = [104, 176, 264, 336, 216, 136, 312][i % 7];
    const y = [96, 144, 248, 288, 184][i % 5];
    return [x, y, 900 + i * 250, 1, mode === 1 && i % 3 === 1 ? 2 : 0, '0:0:0:0:'].join(',');
  });
  return fixture(mode).split('[HitObjects]')[0] + '[HitObjects]\n' + notes.join('\n');
}

async function compareTarget(page, mode) {
  return page.evaluate(async mode => {
    const transport = document.querySelector('#play-button');
    const timeline = document.querySelector('#timeline-host');
    const field = document.querySelector('#playfield');
    const { Renderer, getAudioContext } = window.OsuPlayerCheck;
    const clock = getAudioContext();
    let now = 0, nextFrame = 0, armed = false, observed;
    const pending = new Map();
    Object.defineProperties(clock, {
      currentTime: { get: () => now }, outputLatency: { value: 0 }, baseLatency: { value: 0 },
      getOutputTimestamp: { value: () => ({ contextTime: now, performanceTime: performance.now() }) },
      resume: { value: async () => {} },
    });
    const originalFrame = window.requestAnimationFrame, originalCancel = window.cancelAnimationFrame;
    window.requestAnimationFrame = callback => { pending.set(++nextFrame, callback); return nextFrame; };
    window.cancelAnimationFrame = id => pending.delete(id);
    const originalDraw = Renderer.prototype.renderFrameAt;
    Renderer.prototype.renderFrameAt = function (time) {
      originalDraw.call(this, time);
      if (!armed) return;
      const hit = this.hitResults.findLast(result => (result.displayTime ?? result.time) <= time);
      const combo = this.comboFrames.findLast(frame => frame.time <= time);
      observed = { time, hitTime: hit?.time, judgement: hit?.judgement, combo: combo?.combo ?? 0 };
    };
    const tick = delta => {
      now += delta;
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(now * 1000);
    };
    const capture = action => {
      observed = undefined; armed = true;
      try { action(); } finally { armed = false; }
      if (!observed) throw Error('mode ' + mode + ' produced no frame');
      const gl = field.getContext('webgl');
      const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { ...observed, pixels };
    };
    const drag = (from, to) => {
      const box = timeline.getBoundingClientRect(), duration = Number(timeline.getAttribute('aria-valuemax'));
      const send = (type, ms) => timeline.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1,
        clientX: box.left + box.width * ms / duration, clientY: box.top + box.height / 2 }));
      send('pointerdown', from); send('pointermove', to); send('pointerup', to);
    };
    const toggle = async () => { transport.click(); await new Promise(resolve => setTimeout(resolve, 0)); };
    const difference = (a, b) => {
      let count = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]) > 3) count++;
      }
      return count;
    };
    try {
      await toggle();
      for (let i = 0; i < 39; i++) tick(.125);
      const reference = capture(() => tick(.125));
      const judgement = mode === 3 ? 305 : 300;
      if (reference.time !== 5000 || reference.hitTime !== 4900 || reference.judgement !== judgement || reference.combo !== 17)
        throw Error('mode ' + mode + ' unexpected reference ' + JSON.stringify({ time: reference.time, hit: reference.hitTime, judgement: reference.judgement, combo: reference.combo }));
      await toggle();
      const before = capture(() => drag(5000, 2500));
      const forward = capture(() => drag(2500, 5000));
      const after = capture(() => drag(5000, 7500));
      const reverse = capture(() => drag(7500, 5000));
      if (!(before.combo < reference.combo && after.combo > reference.combo) ||
        difference(before.pixels, reference.pixels) < 50 || difference(after.pixels, reference.pixels) < 50)
        throw Error('mode ' + mode + ' reference must distinguish notes and combo at adjacent test positions');
      drag(5000, 4000); document.querySelector('#btn-loop-a').click();
      drag(4000, 6000); document.querySelector('#btn-loop-b').click();
      drag(6000, 5750); await toggle();
      tick(.125);
      const crossed = capture(() => tick(.25));
      if (Math.abs(crossed.time - 4125) > .00001) throw Error('mode ' + mode + ' crossed B at ' + crossed.time + 'ms: ' + document.querySelector('#btn-loop-a').getAttribute('aria-label') + ', ' + document.querySelector('#btn-loop-b').getAttribute('aria-label'));
      for (let i = 0; i < 6; i++) tick(.125);
      const loop = capture(() => tick(.125));
      for (const [route, frame] of Object.entries({ forward, reverse, loop })) {
        const different = difference(frame.pixels, reference.pixels);
        if (Math.abs(frame.time - reference.time) > .00001 || frame.hitTime !== reference.hitTime ||
          frame.judgement !== reference.judgement || frame.combo !== reference.combo || different)
          throw Error('mode ' + mode + ' ' + route + ' differs at ' + frame.time + 'ms, pixels ' + different + ', judgement ' + frame.judgement + ', combo ' + frame.combo);
      }
      await toggle();
      return { mode, targetMs: reference.time, hitTime: reference.hitTime, judgement: reference.judgement, combo: reference.combo,
        matched: ['forward-drag', 'reverse-drag', 'AB'] };
    } finally {
      Renderer.prototype.renderFrameAt = originalDraw;
      window.requestAnimationFrame = originalFrame; window.cancelAnimationFrame = originalCancel;
    }
  }, mode);
}

function wav(seconds) {
  const bytes = Buffer.alloc(44 + seconds * 8000 * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes.toString('base64');
}

async function checkMedia(browser, helpers) {
  const directory = await mkdtemp(path.join(tmpdir(), 'osu-media-'));
  const page = await browser.newPage();
  try {
    await writeFile(path.join(directory, 'index.html'), '<!doctype html><html><body></body></html>');
    await page.goto(pathToFileURL(path.join(directory, 'index.html')).href);
    const recording = await page.evaluate(async () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 36 });
      const context = canvas.getContext('2d');
      const files = {};
      for (const [name, color] of [['red.png', '#f00'], ['blue.png', '#00f']]) {
        context.fillStyle = color; context.fillRect(0, 0, 64, 36);
        files[name] = [...new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve))).arrayBuffer())];
      }
      context.fillStyle = '#f00'; context.fillRect(0, 0, 64, 36);
      const stream = canvas.captureStream(30), chunks = [], targets = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      recorder.addEventListener('dataavailable', event => chunks.push(event.data));
      const started = new Promise(resolve => recorder.addEventListener('start', resolve, { once: true }));
      const stopped = new Promise(resolve => recorder.addEventListener('stop', resolve, { once: true }));
      const origin = performance.now();
      recorder.start(); await started;
      for (const color of ['#f00', '#0f0', '#00f']) {
        const start = targets.length ? performance.now() - origin : 0;
        for (let frame = 0; frame < 20; frame++) {
          context.fillStyle = color; context.fillRect(0, 0, 64, 36);
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        targets.push(500 + (start + performance.now() - origin) / 2);
      }
      recorder.stop(); await stopped;
      stream.getTracks().forEach(track => track.stop());
      files['movie.webm'] = [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
      return { files, targets };
    });
    const assets = recording.files;
    await Promise.all(Object.entries(assets).map(([name, bytes]) => writeFile(path.join(directory, name), new Uint8Array(bytes))));
    await page.addScriptTag({ content: helpers });
    return await page.evaluate(async ({ assets, base, targets }) => {
      const { createPreviewMedia, createStageContext } = window.OsuVisualCheck;
      const results = [];
      const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
      for (const kind of ['file', 'bytes']) {
        const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 180 });
        const context = createStageContext(canvas), controller = new AbortController(), warnings = [];
        let media, time = 0, playing = false;
        const resource = name => kind === 'file' ? { uri: new URL(name, base).href } : new Uint8Array(assets[name]);
        const draw = () => {
          if (!media) return;
          context.beginFrame(); context.setTransform(.25, 0, 0, .25, 0, 0);
          context.clearRect(0, 0, 1280, 720);
          context.fillStyle = '#000'; context.fillRect(0, 0, 1280, 720);
          media.sync(time, playing); media.drawUnder(context, time); media.drawOver(context, time);
          context.flush();
        };
        context.onInvalidate = () => { if (!playing) draw(); };
        const pixel = (x = 160, y = 90) => {
          const value = new Uint8Array(4);
          context.gl.readPixels(x, canvas.height - y - 1, 1, 1, context.gl.RGBA, context.gl.UNSIGNED_BYTE, value);
          return [...value];
        };
        const expectColor = async (channel, x = 160, y = 90) => {
          for (let tries = 0; tries < 100; tries++) {
            const value = pixel(x, y);
            if (value[channel] > 230 && value.filter((_, i) => i < 3 && i !== channel).every(v => v < 30)) return value;
            await wait(10);
          }
          throw Error(`${kind} media at ${time}ms has stale pixels ${pixel(x, y)}`);
        };
        const settings = { backgroundBrightness: 100, backgroundBlur: 0, playbackSpeed: 1, storyboardEnabled: true, videoEnabled: true };
        media = await createPreviewMedia({ stage: context, files: new Map([['movie.webm', resource('movie.webm')]]),
          osuPath: 'map.osu', osuBytes: new TextEncoder().encode('[Events]\nVideo,500,"movie.webm"'),
          signal: controller.signal, onWarning: message => warnings.push(message) });
        media.configure(settings);
        const colors = [];
        for (const blur of [0, 10]) {
          media.configure({ ...settings, backgroundBlur: blur });
          for (const channel of [0, 1, 2, 0, 2, 0]) {
            time = targets[channel]; media.sync(time, false, true); draw();
            colors.push(await expectColor(channel));
          }
        }
        media.configure(settings);
        time = targets[0]; media.sync(time, false, true); draw();
        await expectColor(0);
        playing = true; media.sync(time, true); draw();
        let advanced = false;
        const deadline = performance.now() + targets[2] - targets[0] + 3000;
        while (!advanced && performance.now() < deadline) {
          await wait(20);
          context.beginFrame(); media.drawUnder(context, time); context.flush();
          const value = pixel();
          advanced = value[1] > 230 || value[2] > 230;
        }
        if (!advanced) throw Error(`${kind} video failed to play without a seek`);
        time = targets[1]; playing = false; media.sync(time, false, true); draw();
        const paused = await expectColor(1);
        await wait(targets[2] - targets[1] + 150);
        context.beginFrame(); media.drawUnder(context, time); context.flush();
        if (pixel().some((value, i) => value !== paused[i])) throw Error('paused video advanced');
        media.configure({ ...settings, videoEnabled: false });
        if (pixel().some((value, i) => i < 3 && value !== 0)) throw Error('disabled video remains visible');
        media.configure(settings); await expectColor(1);
        media.dispose(); media = undefined;

        const events = '[Events]\nAnimation,Foreground,Centre,"frame.png",320,240,2,1000,LoopForever\n F,0,10000,60000,1\n' +
          'Sprite,Foreground,Centre,"red.png",400,240\n F,0,10000,60000,1\n' +
          'Sprite,Foreground,Centre,"blue.png",400,240\n F,0,10000,60000,0.5\n' +
          'Sprite,Overlay,Centre,"blue.png",480,240\n F,0,10000,60000,1';
        media = await createPreviewMedia({ stage: context, files: new Map([['frame0.png', resource('red.png')], ['frame1.png', resource('blue.png')],
          ['red.png', resource('red.png')], ['blue.png', resource('blue.png')]]), osuPath: 'map.osu', osuBytes: new TextEncoder().encode(events),
          signal: controller.signal, onWarning: message => warnings.push(message) });
        media.configure({ ...settings, backgroundBrightness: 50 });
        for (const [target, channel] of [[10500, 0], [11500, 2], [53500, 2], [52500, 0], [11900, 2], [10100, 0]]) {
          time = target; draw();
          for (let tries = 0; tries < 100 && pixel()[channel] < 120; tries++) await wait(10);
          const value = pixel();
          if (Math.abs(value[channel] - 128) > 2 || value.some((v, i) => i < 3 && i !== channel && v > 2)) throw Error('storyboard seek did not restore its animation frame');
        }
        const mixed = pixel(190, 90);
        if (Math.abs(mixed[0] - 64) > 2 || Math.abs(mixed[2] - 64) > 2) throw Error('storyboard layer opacity/order changed');
        await expectColor(2, 220, 90);
        time = 60001; draw();
        if (pixel().slice(0, 3).some(Boolean)) throw Error('expired storyboard stays visible');
        controller.abort(); media.dispose(); context.dispose();
        if (warnings.length) throw Error(warnings.join(', '));
        results.push({ kind, videoFrames: colors.length, advanced, paused: true, animationSeek: true, mixed, overlay: true, expired: true });
      }
      return results;
    }, { assets, targets: recording.targets, base: pathToFileURL(path.join(directory, 'index.html')).href });
  } finally {
    await page.close();
    await rm(directory, { recursive: true, force: true });
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=document-user-activation-required', '--allow-file-access-from-files'] });
const results = [];
try {
  if (helpers) {
  const visualPage = await browser.newPage();
  await visualPage.setContent('<!doctype html><html><body></body></html>');
  await visualPage.addScriptTag({ content: helpers });
  const pixels = await visualPage.evaluate(async (catchChart) => {
    const { createStageContext, drawTrack, createPreviewMedia, createBuiltinSkin, disposeBuiltinSkins, parseBeatmap, computeModDifficulty, buildAutoReplay, catchRuleset, taikoRuleset } = window.OsuVisualCheck;
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const canvas = (width = 1280, height = 720) => Object.assign(document.createElement('canvas'), { width, height });
    const source = canvas(), sourceContext = source.getContext('2d');
    sourceContext.fillStyle = '#000'; sourceContext.fillRect(0, 0, 1280, 720);
    sourceContext.fillStyle = '#fff'; sourceContext.fillRect(0, 0, 640, 720);
    const overlay = canvas(32, 32), overlayContext = overlay.getContext('2d');
    overlayContext.fillStyle = '#ff0000'; overlayContext.fillRect(0, 0, 32, 32);
    const settings = { backgroundBlur: 20, backgroundBrightness: 100, storyboardEnabled: true, videoEnabled: true };
    const target = canvas(), context = createStageContext(target);
    const media = await createPreviewMedia({ stage: context, files: new Map([
      ['background.png', { uri: source.toDataURL() }], ['overlay.png', { uri: overlay.toDataURL() }],
    ]), osuPath: 'map.osu', osuBytes: new TextEncoder().encode('[Events]\n0,0,"background.png",0,0\nSprite,Overlay,Centre,"overlay.png",320,240\n F,0,0,5000,1\nSprite,Overlay,Centre,"overlay.png",400,240\n F,0,0,5000,0.5\n C,0,0,5000,128,255,255'),
    signal: new AbortController().signal, onWarning(message) { throw new Error(message); } });
    context.beginFrame();
    const pixel = (x, y) => {
      context.flush(); const gl = context.gl, out = new Uint8Array(4);
      gl.readPixels(x, target.height - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return out;
    };
    media.configure(settings); media.drawUnder(context, 1000); media.drawOver(context, 1000);
    const edge = pixel(640, 300), red = pixel(640, 360);
    check(edge[0] > 70 && edge[0] < 190, 'background pixels must be blurred');
    check(red[0] === 255 && red[1] === 0 && red[2] === 0, 'Overlay must stay sharp and undimmed');
    const tintedOverlay = pixel(760, 360);
    check(Math.abs(tintedOverlay[0] - 64) < 2 && tintedOverlay[1] === 0 && tintedOverlay[2] === 0, 'storyboard tint and opacity multiply the original sprite');
    media.configure({ ...settings, backgroundBrightness: 50 });
    media.drawUnder(context, 1000); media.drawOver(context, 1000);
    check(pixel(640, 300)[0] < edge[0] * 0.6, 'brightness applies after blur');
    check(pixel(640, 360)[0] === 255, 'brightness must not dim Overlay');
    media.configure({ ...settings, backgroundBlur: 0 });
    context.clearRect(0, 0, 1280, 720); media.drawUnder(context, 1000);
    check(pixel(636, 300)[0] === 255 && pixel(644, 300)[0] === 0, 'zero blur restores the sharp background');
    media.dispose();

    context.clearRect(0, 0, 1280, 720);
    context.fillStyle = '#000'; context.fillRect(0,0,1280,720);
    context.globalAlpha = 0.5;
    const cross = [{x:100,y:100},{x:300,y:300},{x:100,y:300},{x:300,y:100}];
    drawTrack(context, cross, 29.5, 1.5, '#ffffff','#008800');
    const centre = pixel(200,200), single = pixel(150,150), rim = pixel(150,190);
    check(centre.every((v,i) => Math.abs(v-single[i]) < 3) && centre[1] > 60 && centre[1] < 73, 'crossing slider must have one coverage');
    check(rim[0] > 110 && rim[2] > 110, 'slider retains its outline');
    context.globalAlpha = 1;

    const skin = await createBuiltinSkin('brick', 4, 60, 2), sprite = canvas(256, 256), spriteContext = sprite.getContext('2d');
    const alphas = [];
    for (const stem of ['fruit-pear', 'fruit-grapes', 'fruit-apple', 'fruit-orange', 'fruit-drop', 'fruit-bananas']) {
      spriteContext.clearRect(0, 0, 256, 256); spriteContext.drawImage(skin.images.get(`${stem}@2x.png`), 0, 0);
      const centre = spriteContext.getImageData(128, 128, 1, 1).data[3];
      const rim = spriteContext.getImageData(240, 128, 1, 1).data[3];
      const outside = spriteContext.getImageData(0, 0, 1, 1).data[3];
      check(centre === 128 && rim === 255 && outside === 0, `${stem} must be a translucent disc with an opaque rim`);
      alphas.push({ stem, centre, rim, outside });
    }
    const beatmap = parseBeatmap(catchChart), replay = buildAutoReplay(new TextEncoder().encode(catchChart), '');
    const session = catchRuleset.build(beatmap, replay, computeModDifficulty(beatmap, replay), skin, 1);
    context.clearRect(0, 0, 1280, 720);
    catchRuleset.draw(context, session, 2400, { modHidden: false, modFlashlight: false });
    const tinted = pixel(640, 320);
    const tintedRim = pixel(679, 320);
    check(tinted[3] === 128, `engine tinting must preserve half alpha: ${tinted[3]}`);
    check(tintedRim[3] === 255, `engine tinting must keep the catch rim opaque: ${tintedRim[3]}`);
    check(pixel(640, 630)[3] === 255, 'catcher must remain opaque');
    context.clearRect(0, 0, 1280, 720);
    catchRuleset.draw(context, session, 2400, { modHidden: false, modFlashlight: true });
    const catchShade = pixel(30, 40);
    check(catchShade[0] === 0 && catchShade[3] === 255, 'catch flashlight shades the far corner');
    const taikoChart = catchChart.replace('Mode: 2', 'Mode: 1').replace(/\[HitObjects\][\s\S]*$/, '[HitObjects]\n256,192,1000,8,0,6000,0:0:0:0:');
    const taikoMap = parseBeatmap(taikoChart), taikoReplay = buildAutoReplay(taikoMap, '');
    const taikoSkin = await createBuiltinSkin('brick', 4, 60, 1);
    const taiko = taikoRuleset.build(taikoMap, taikoReplay, computeModDifficulty(taikoMap, taikoReplay), taikoSkin, 1);
    context.clearRect(0, 0, 1280, 720);
    taikoRuleset.draw(context, taiko, 1600, { modHidden: false, modFlashlight: false });
    context.flush();
    const column = new Uint8Array(215 * 4);
    context.gl.readPixels(506, 0, 1, 215, context.gl.RGBA, context.gl.UNSIGNED_BYTE, column);
    check(column.some((v, i) => i % 4 === 3 && v > 70), 'active taiko swell shows its ring below the drum lane');
    const outside = pixel(1150, 220);
    context.clearRect(0, 0, 1280, 720);
    taikoRuleset.draw(context, taiko, 1600, { modHidden: false, modFlashlight: true });
    const laneShade = pixel(1150, 360);
    check(laneShade[0] === 0 && laneShade[3] === 255, 'taiko flashlight shades the end of the lane');
    check(pixel(1150, 220).every((v, i) => v === outside[i]), 'taiko flashlight stays inside the lane');
    await disposeBuiltinSkins();
    for (const item of [source, overlay, target, sprite]) item.width = item.height = 0;
    context.dispose();
    return { blurredEdge: [...edge], sliderCross: [...centre], alphas, tintedAlpha: tinted[3] };
  }, fixture(2));
  results.push({ pixels });
  await visualPage.close();
  results.push({ media: await checkMedia(browser, helpers) });
  }

  for (const mode of [0, 1, 2, 3]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.messages = []; window.resumes = 0; window.starts = 0; window.musicStarts = 0;
      window.ReactNativeWebView = { postMessage: text => window.messages.push(JSON.parse(text)) };
      const resume = AudioContext.prototype.resume, start = AudioBufferSourceNode.prototype.start;
      AudioContext.prototype.resume = function (...args) { window.resumes++; return resume.apply(this, args); };
      AudioBufferSourceNode.prototype.start = function (...args) { window.starts++; if (this.buffer?.duration === 20) window.musicStarts++; return start.apply(this, args); };
    });
    const config = { theme: 'dark', requestedMode: mode, chartPath: 'map.osu', files: [{ path: 'map.osu', mime: 'text/plain', text: denseFixture(mode) }], settings: {} };
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.endsWith('/player.js')) return route.fulfill({ contentType: 'text/javascript', body: player });
      if (url.endsWith('/audio-data.js')) return route.fulfill({ contentType: 'text/javascript', body: '' });
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
    if (mode === 3) {
      const before = await page.evaluate(() => ({ time: Number(document.querySelector('#timeline-host').getAttribute('aria-valuenow')), starts: window.musicStarts }));
      await page.locator('#mania-skin-trigger').dispatchEvent('keydown', { key: 'End' });
      await page.waitForFunction(time => document.querySelector('#mania-skin-trigger').getAttribute('aria-valuetext') === '圆圈'
        && Number(document.querySelector('#timeline-host').getAttribute('aria-valuenow')) > time + 100, before.time);
      assert.equal(await page.evaluate(() => window.musicStarts), before.starts, 'changing mania skin keeps the song playing');
    }
    await page.locator('#play-button').click();
    const paused = await page.locator('#timeline-host').getAttribute('aria-valuenow');
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#timeline-host').getAttribute('aria-valuenow'), paused);
    await page.locator('#btn-restart').click();
    await page.waitForFunction(() => document.querySelector('#play-button').getAttribute('aria-label') === '暂停' && Number(document.querySelector('#timeline-host').getAttribute('aria-valuenow')) < 1000);
    await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'pause', cause: 'lifecycle' }) })));
    await page.waitForFunction(() => document.querySelector('#play-button').getAttribute('aria-label') === '播放');
    const stopped = await page.locator('#timeline-host').getAttribute('aria-valuenow');
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#timeline-host').getAttribute('aria-valuenow'), stopped);
    if (helpers) {
      await page.reload();
      await page.waitForFunction(() => window.messages.some(message => message.type === 'ready'));
      results.push({ comparison: await compareTarget(page, mode) });
    }
    assert.deepEqual(errors, []);
    results.push({ mode, readyPaused: true, silentSeek: true, playPauseRestart: true, lifecyclePaused: true });
    await page.close();
  }
  console.log(JSON.stringify({ passed: true, mode: generated ? 'generated' : 'source', coverage: ['four-mode-playback', ...(generated ? [] : ['visual-helper-pixels', 'local-media-pixels', 'four-mode-target-comparison'])], omitted: generated ? ['visual-helper-pixels', 'local-media-pixels', 'four-mode-target-comparison'] : [], results }, null, 2));
} finally {
  await browser.close();
}

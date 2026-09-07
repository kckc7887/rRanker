import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { deepStrictEqual } from 'node:assert';

const baselineSha = process.env.OPTIMIZATION_BASELINE_SHA ?? '246f0bbe57bb9a23ce21858c82c53b3066aad3d9';
const candidateSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const framePath = 'src/features/simai-chart-preview/engine/renderers/frame.ts';
const rpePath = 'src/features/phigros-chart-preview/webview-player/rpe-renderer.ts';
const require = createRequire(import.meta.url);

async function engine(baseline) {
  const result = await build({
    stdin: { contents: `
      export * from './${framePath}';
      export * from './src/features/simai-chart-preview/engine/core/parser/SimaiParser';
      export { DEFAULT_RENDERER_CONFIG, mirrorHint } from './src/features/simai-chart-preview/engine/renderers/MainRenderer';
      export { RpeRenderer } from './${rpePath}';
      export { parseRpeChart } from './src/features/phigros-chart-preview/webview-player/rpe-core';
      export { indexSongsById } from './src/domain/catalog';
    `, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent',
    plugins: baseline ? [{ name: 'fixed-baseline', setup(context) {
      context.onLoad({ filter: /(?:frame|rpe-renderer)\.ts$/ }, (args) => {
        const path = [framePath, rpePath].find((path) => resolve(path) === args.path);
        if (!path) return undefined;
        return { contents: execFileSync('git', ['show', `${baselineSha}:apps/mobile/${path}`], { encoding: 'utf8' }), loader: 'ts' };
      });
    } }] : [],
  });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, require);
  return module.exports;
}

const [before, after] = await Promise.all([engine(true), engine(false)]);
const cases = JSON.parse(readFileSync('tests/fixtures/maimai-simai-cases.json', 'utf8'));
const charts = Object.entries(cases).map(([name, body]) => ({ name, chart: before.parseSimaiBody(body) }));
charts.push({ name: 'long-hold-and-ties', chart: before.parseSimaiBody('(120){4}1h[#45]/5h[#30],Cf/Chf[#15],1-3[4:1]*-5[4:1]/1-7[4:1],1/1,') });
let comparedFrames = 0, comparedCommands = 0;
for (const { name, chart } of charts) {
  const first = before.prepareChart(chart), second = after.prepareChart(chart);
  const times = [...new Set([-2500, -1, 0, 1, 75, 250, 499, 500, 501, 1000, 2500, 10000, 30000, 45000,
    ...chart.notes.flatMap((note) => [note.timingMs - 1, note.timingMs, note.timingMs + 1, note.endTimeMs, note.endTimeMs + 449])])];
  // Reverse order and repeated times exercise seek/pause rather than a monotonic-only playback path.
  const sequence = [...times, ...times.toReversed(), ...times.slice(0, 4)];
  for (const playbackSpeed of [0.5, 1, 2]) for (const alwaysKeepHiSpeed of [false, true]) {
    const config = { ...before.DEFAULT_RENDERER_CONFIG, playbackSpeed, alwaysKeepHiSpeed, highlightExNotes: true };
    for (const time of sequence) {
      const expected = before.buildFrame(first, time, config), actual = after.buildFrame(second, time, config);
      deepStrictEqual(actual, expected, `${name} @ ${time}, speed ${playbackSpeed}, keep ${alwaysKeepHiSpeed}`);
      for (const [x, y] of [[-1, 1], [1, -1], [-1, -1]]) {
        deepStrictEqual(actual.map((command) => after.mirrorHint(command, x, y)), expected.map((command) => before.mirrorHint(command, x, y)));
      }
      comparedFrames++; comparedCommands += actual.length;
    }
  }
}

function distribution(samples) {
  const sorted = samples.toSorted((a, b) => a - b);
  return { samples: sorted.length, medianMs: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.floor(sorted.length * .95)] };
}
const largeChart = before.parseSimaiBody('(180){16}' + Array.from({ length: 3000 }, (_, i) => `${i % 8 + 1}/${(i + 4) % 8 + 1}`).join(',') + ',');
const prepared = [before.prepareChart(largeChart), after.prepareChart(largeChart)];
const frameSamples = [[], []];
for (let i = -80; i < 360; i++) {
  const time = Math.max(0, i) * 173 % largeChart.durationMs;
  for (const index of [i % 2 === 0 ? 0 : 1, i % 2 === 0 ? 1 : 0]) {
    const engine = index ? after : before;
    const start = performance.now();
    engine.buildFrame(prepared[index], time, engine.DEFAULT_RENDERER_CONFIG);
    if (i >= 0) frameSamples[index].push(performance.now() - start);
  }
}

function rpeState(engine, notes) {
  const renderer = Object.create(engine.RpeRenderer.prototype);
  renderer.chart = { lines: [{ notes }] };
  renderer.activeWindows = [{ index: 0, notes: [] }];
  renderer.lastVisitedNotes = 0;
  const drawn = [];
  renderer.drawNote = (_context, note) => { drawn.push(note.id); return false; };
  return { renderer, drawn };
}
const rpeNotes = Array.from({ length: 1000 }, (_, i) => ({ id: i, hitTime: i * .01, visibleTime: 4,
  endHitTime: i * .01 + (i % 4 === 0 ? 15 : 0), kind: ['hold', 'drag', 'tap', 'flick'][i % 4] }));
let comparedRpeFrames = 0;
for (const sequence of [[0, .1, 1, 3, 5, 10, 11, 20, 30], [8, 8, 9, 12], [-4, -2, 0, 8]]) {
  const states = [rpeState(before, rpeNotes), rpeState(after, rpeNotes)];
  const retainedArray = states[1].renderer.activeWindows[0].notes;
  for (const time of sequence) {
    for (const { renderer, drawn } of states) { drawn.length = 0; renderer.drawNotes({}, 0, {}, time); }
    deepStrictEqual(states[1].drawn, states[0].drawn, `RPE paint order @ ${time}`);
    deepStrictEqual(states[1].renderer.activeWindows, states[0].renderer.activeWindows, `RPE window @ ${time}`);
    if (states[1].renderer.activeWindows[0].notes !== retainedArray) throw new Error('RPE replaced its active array');
    comparedRpeFrames++;
  }
}

// Record all Canvas commands/state mutations, including textures and hit effects.
globalThis.window = { devicePixelRatio: 2 };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
function recordedRenderer(engine, chart) {
  let canvasId = 0;
  const commands = [];
  function canvas() {
    const id = `canvas-${canvasId++}`;
    let state = { globalAlpha: 1 };
    const stack = [];
    const normalize = (arg) => arg?.imageId ?? arg?.canvasId ?? arg;
    const context = new Proxy({}, {
      set(_object, key, value) { state[key] = value; commands.push([id, 'set', key, normalize(value)]); return true; },
      get(_object, key) {
        if (key in state) return state[key];
        return (...args) => {
          commands.push([id, key, ...args.map(normalize)]);
          if (key === 'save') stack.push({ ...state });
          if (key === 'restore') state = stack.pop() ?? state;
          if (key === 'measureText') return { width: String(args[0]).length * 12 };
        };
      },
    });
    return { canvasId: id, width: 1350, height: 900, clientWidth: 675, clientHeight: 450,
      style: {}, setAttribute() {}, getContext: () => context,
      getBoundingClientRect: () => ({ width: 675, height: 450 }) };
  }
  globalThis.document = { createElement: () => canvas() };
  const renderer = new engine.RpeRenderer(canvas());
  renderer.setChart(chart);
  const image = (imageId, width = 256, height = 256) => ({ imageId, width, height, naturalWidth: width, naturalHeight: height });
  const style = (prefix) => Object.fromEntries(['tap', 'hold', 'drag', 'flick'].map((kind) => [kind, image(prefix + kind, 256, kind === 'hold' ? 1000 : 256)]));
  renderer.setNoteAssets({ normal: style('normal-'), multi: style('multi-'), fx: image('fx', 768, 640) });
  renderer.setIllustration(image('illustration', 800, 600));
  return { renderer, commands };
}
const event = (start, end, from = 0, to = 16) => ({ startTime: [from, 0, 1], endTime: [to, 0, 1], start, end, easingType: 1 });
const rpeChart = before.parseRpeChart({ META: { RPEVersion: 150 }, BPMList: [{ startTime: [0, 0, 1], bpm: 120 }],
  judgeLineList: [0, 1].map((line) => ({ Texture: 'line.png', zOrder: line, isCover: 1,
    eventLayers: [{ moveXEvents: [event(-200, 200)], moveYEvents: [event(0, 100)], rotateEvents: [event(0, 80)],
      alphaEvents: [event(255, 255)], speedEvents: [event(9, 9, 0, 4), event(0, 0, 4, 8), event(-3, 6, 8, 20)] }],
    notes: Array.from({ length: 48 }, (_, index) => ({ type: index % 4 + 1, above: index % 2 + 1,
      startTime: [index, 0, 1], endTime: [index + (index % 4 === 1 ? 30 : 0), 0, 1],
      positionX: (index % 5 - 2) * 70, yOffset: 0, alpha: 255, size: 1, speed: 1,
      isFake: index % 11 === 0 ? 1 : 0, visibleTime: 4 })),
  })),
});
let canvasFrames = 0, canvasCommands = 0;
for (const flipX of [false, true]) for (const noteScale of [.5, 1, 2]) {
  const states = [recordedRenderer(before, rpeChart), recordedRenderer(after, rpeChart)];
  for (const { renderer } of states) renderer.setSettings({ flipX, noteScale, multiHint: true });
  for (const time of [-2, 0, .01, .1, .25, .5, .75, 1, 3.99, 4, 6, 10, 15, 20, 28, 35, 20, 10, 2, 2, 2.1]) {
    for (const { renderer, commands } of states) { commands.length = 0; renderer.render(time); }
    deepStrictEqual(states[1].commands, states[0].commands, `RPE complete Canvas stream @ ${time}, flip ${flipX}, scale ${noteScale}`);
    canvasFrames++; canvasCommands += states[1].commands.length;
  }
}

const songs = Array.from({ length: 5000 }, (_, id) => ({ id: String(id), title: `song ${id}` }));
const records = Array.from({ length: 20000 }, (_, index) => ({ songId: String(index % 5000) }));
const searchSamples = [[], []], indexSamples = [];
let lookupComparisons = 0;
for (let sample = 0; sample < 25; sample++) {
  let start = performance.now();
  const index = after.indexSongsById(songs);
  indexSamples.push(performance.now() - start);
  start = performance.now();
  const old = records.map((record) => songs.find((song) => { if (!sample) lookupComparisons++; return song.id === record.songId; })?.title);
  searchSamples[0].push(performance.now() - start);
  start = performance.now();
  const current = records.map((record) => index.get(record.songId)?.title);
  searchSamples[1].push(performance.now() - start);
  deepStrictEqual(current, old);
}
const report = {
  environment: { node: process.version, platform: process.platform, architecture: process.arch },
  baselineSha, candidateSha, worktreeDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  measurement: 'Desktop Node CPU; not device FPS, GPU, memory, audio or WebView acceptance',
  simai: { comparedFrames, comparedCommands, benchmarkNotes: largeChart.notes.length,
    baseline: distribution(frameSamples[0]), candidate: distribution(frameSamples[1]) },
  rpe: { comparedFrames: comparedRpeFrames, activeArrayReplacementsPerFrame: { baseline: 1, candidate: 0 },
    canvasFrames, canvasCommands,
    coverage: 'complete Canvas commands with textures, effects, SV, long Holds, seeking, pause, mirror and size changes; WebGL shaders unchanged and require device acceptance' },
  search: { songs: songs.length, records: records.length, baselineComparisons: lookupComparisons, candidateLookups: records.length,
    indexBuild: distribution(indexSamples), baseline: distribution(searchSamples[0]), candidate: distribution(searchSamples[1]) },
};
mkdirSync('build', { recursive: true });
writeFileSync('build/optimization-performance.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));

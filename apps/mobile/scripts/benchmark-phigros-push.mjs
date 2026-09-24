import { build } from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { deepStrictEqual } from 'node:assert';

const require = createRequire(import.meta.url);
const result = await build({
  stdin: {
    contents: `export { findPushRecommendations } from './src/domain/phigros-push';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
  plugins: [{
    name: 'at-alias',
    setup(context) {
      context.onResolve({ filter: /^@\// }, (args) => {
        const base = resolve('src', args.path.slice(2));
        for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
          if (existsSync(candidate)) return { path: candidate };
        }
        return undefined;
      });
    },
  }],
});
const module = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, require);
const { findPushRecommendations } = module.exports;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCase(entryCount, seed) {
  const random = mulberry32(seed);
  const gameRecord = {};
  const difficultyTable = {};
  let scored = 0;
  let song = 0;
  while (scored < entryCount) {
    const id = `song.${song}`;
    const diffs = [0, 0, 0, 0];
    const levels = [null, null, null, null];
    for (const level of [2, 3, 1, 0]) {
      if (level !== 2 && random() >= 0.4) continue;
      diffs[level] = Math.round((9 + random() * 7) * 10) / 10;
      if (scored >= entryCount) continue;
      const roll = random();
      const rawAcc = roll < 0.05 ? 100 : roll < 0.15 ? 70 + random() * 18 : 92 + random() * 7.9;
      levels[level] = {
        songId: id, level, difficulty: 0, score: Math.floor(rawAcc * 10000),
        rawAcc, acc: Math.round(rawAcc * 100) / 100, fc: rawAcc >= 100, rks: 0,
      };
      scored += 1;
    }
    difficultyTable[id] = diffs;
    gameRecord[id] = levels;
    song += 1;
  }
  return { gameRecord, difficultyTable };
}

function distribution(samples) {
  const sorted = samples.toSorted((a, b) => a - b);
  return {
    samples: sorted.length,
    medianMs: sorted[Math.floor(sorted.length * 0.5)],
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    maxMs: sorted[sorted.length - 1],
  };
}

const options = { delta: 0.05, chartCost: 3, includePhi: true };

async function measureBlocking(run) {
  const gaps = [];
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    gaps.push(now - last);
    last = now;
  }, 5);
  const start = performance.now();
  try {
    await run();
  } finally {
    clearInterval(timer);
  }
  const total = performance.now() - start;
  gaps.push(performance.now() - last);
  return { total, maxGap: Math.max(...gaps) };
}

const cases = {};
for (const entryCount of [30, 300, 1000]) {
  const input = buildCase(entryCount, 20260924);
  const first = await findPushRecommendations(input.gameRecord, input.difficultyTable, options);
  const second = await findPushRecommendations(input.gameRecord, input.difficultyTable, options);
  deepStrictEqual(second, first, `push recommendations must be deterministic at ${entryCount} entries`);
  const samples = [];
  let maxBlockMs = 0;
  for (let sample = 0; sample < 5; sample += 1) {
    const measured = await measureBlocking(
      () => findPushRecommendations(input.gameRecord, input.difficultyTable, options),
    );
    samples.push(measured.total);
    maxBlockMs = Math.max(maxBlockMs, measured.maxGap);
  }
  cases[entryCount] = {
    searchStatus: first.searchStatus,
    planLength: first.plan.length,
    maxBlockMs: Math.round(maxBlockMs * 10) / 10,
    total: distribution(samples),
  };
}

const report = {
  environment: { node: process.version, platform: process.platform, architecture: process.arch },
  measurement: 'Desktop Node wall time; maxBlockMs is the longest observed event-loop gap (5ms probe) during one search. Not device FPS, memory or audio acceptance.',
  options,
  cases,
};
mkdirSync('build', { recursive: true });
writeFileSync('build/phigros-push-performance.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

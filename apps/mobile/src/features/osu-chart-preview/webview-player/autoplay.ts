import {
  applyStacking,
  computeModDifficulty,
  generateCatchAutoReplay,
  generateManiaAutoReplay,
  generateStdAutoReplay,
  generateTaikoAutoReplay,
  parseBeatmap,
  type BeatmapData,
  type ReplayData,
} from './engine';
import { decodeOsuText } from './osu-text';
import { createReplay, finishAutoFrames, type AutoFrame } from './engine/utils/autoReplay';
import { preparedCatchObjects } from './engine/rulesets/catch/positions';
import { pauseChartPreviewParse, CHART_PREVIEW_PARSE_YIELD_INTERVAL } from '../../chart-preview-shared/chart-preview-resource-budget';

export function parseOsuBytes(bytes: Uint8Array): BeatmapData {
  return parseBeatmap(decodeOsuText(bytes));
}

function* autoFrames(beatmap: BeatmapData, replay: ReplayData): Generator<AutoFrame> {
  const modDiff = computeModDifficulty(beatmap, replay);

  if (beatmap.mode === 1) {
    yield* generateTaikoAutoReplay(beatmap, modDiff);
    return;
  }
  if (beatmap.mode === 2) {
    const objects = preparedCatchObjects(beatmap, modDiff);
    yield* generateCatchAutoReplay(objects, modDiff);
    return;
  }
  if (beatmap.mode === 3) {
    yield* generateManiaAutoReplay(beatmap, modDiff);
    return;
  }
  applyStacking(beatmap, modDiff);
  yield* generateStdAutoReplay(beatmap, modDiff, replay.motion = []);
}

async function prepareAutoReplay(source: Uint8Array | BeatmapData, hash: string, signal: AbortSignal): Promise<ReplayData> {
  signal.throwIfAborted();
  const beatmap = source instanceof Uint8Array ? parseOsuBytes(source) : source;
  const replay = createReplay(beatmap, hash);
  const frames = replay.frames;
  const cancellation = { signal };
  const slice = {};
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  signal.throwIfAborted();
  for (const frame of autoFrames(beatmap, replay)) {
    frames.push({ timeDelta: frame.time, x: frame.x, y: frame.y, keys: frame.keys });
    if (frames.length % CHART_PREVIEW_PARSE_YIELD_INTERVAL === 0) await pauseChartPreviewParse(frames.length, cancellation, slice);
  }
  signal.throwIfAborted();
  finishAutoFrames(frames);
  return replay;
}

export function buildAutoReplay(source: Uint8Array | BeatmapData, hash: string): ReplayData;
export function buildAutoReplay(source: Uint8Array | BeatmapData, hash: string, signal: AbortSignal): Promise<ReplayData>;
export function buildAutoReplay(source: Uint8Array | BeatmapData, hash: string, signal?: AbortSignal): ReplayData | Promise<ReplayData> {
  if (signal) return prepareAutoReplay(source, hash, signal);
  const beatmap = source instanceof Uint8Array ? parseOsuBytes(source) : source;
  const replay = createReplay(beatmap, hash);
  for (const f of autoFrames(beatmap, replay)) replay.frames.push({ timeDelta: f.time, x:f.x, y:f.y, keys:f.keys });
  finishAutoFrames(replay.frames);
  return replay;
}

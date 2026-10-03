import {
  applyPositionOffsets,
  applyStacking,
  computeModDifficulty,
  convertBeatmapToCatch,
  generateCatchAutoReplay,
  generateManiaAutoReplay,
  generateStdAutoReplay,
  generateTaikoAutoReplay,
  parseBeatmap,
  synthesizeAutoReplay,
  type BeatmapData,
  type ReplayData,
} from './engine';
import { decodeOsuText } from './osu-text';
import type { AutoFrame } from './engine/utils/autoReplay';
import { pauseChartPreviewParse, CHART_PREVIEW_PARSE_YIELD_INTERVAL } from '../../chart-preview-shared/chart-preview-resource-budget';

function stubReplay(beatmap: BeatmapData, hash: string): ReplayData {
  return synthesizeAutoReplay(beatmap, hash, [], 0);
}

export function parseOsuBytes(bytes: Uint8Array): BeatmapData {
  return parseBeatmap(decodeOsuText(bytes));
}

function* autoFrames(beatmap: BeatmapData, hash: string): Generator<AutoFrame> {
  const stub = stubReplay(beatmap, hash);
  const modDiff = computeModDifficulty(beatmap, stub);

  if (beatmap.mode === 1) {
    yield* generateTaikoAutoReplay(beatmap, modDiff);
    return;
  }
  if (beatmap.mode === 2) {
    const objects = convertBeatmapToCatch(beatmap, modDiff);
    applyPositionOffsets(objects, beatmap, modDiff);
    yield* generateCatchAutoReplay(objects, modDiff);
    return;
  }
  if (beatmap.mode === 3) {
    yield* generateManiaAutoReplay(beatmap, modDiff);
    return;
  }
  applyStacking(beatmap, modDiff);
  yield* generateStdAutoReplay(beatmap, modDiff);
}

async function prepareAutoReplay(source: Uint8Array | BeatmapData, hash: string, signal: AbortSignal): Promise<ReplayData> {
  signal.throwIfAborted();
  const beatmap = source instanceof Uint8Array ? parseOsuBytes(source) : source;
  const frames: AutoFrame[] = [];
  for (const frame of autoFrames(beatmap, hash)) {
    frames.push(frame);
    if (frames.length % CHART_PREVIEW_PARSE_YIELD_INTERVAL === 0) await pauseChartPreviewParse(frames.length, { signal });
  }
  signal.throwIfAborted();
  return synthesizeAutoReplay(beatmap, hash, frames);
}

export function buildAutoReplay(source: Uint8Array | BeatmapData, hash: string): ReplayData;
export function buildAutoReplay(source: Uint8Array | BeatmapData, hash: string, signal: AbortSignal): Promise<ReplayData>;
export function buildAutoReplay(source: Uint8Array | BeatmapData, hash: string, signal?: AbortSignal): ReplayData | Promise<ReplayData> {
  if (signal) return prepareAutoReplay(source, hash, signal);
  const beatmap = source instanceof Uint8Array ? parseOsuBytes(source) : source;
  return synthesizeAutoReplay(beatmap, hash, autoFrames(beatmap, hash));
}

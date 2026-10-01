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

function stubReplay(beatmap: BeatmapData, hash: string): ReplayData {
  return synthesizeAutoReplay(beatmap, hash, [], 0);
}

export function parseOsuBytes(bytes: Uint8Array): BeatmapData {
  return parseBeatmap(decodeOsuText(bytes));
}

export function buildAutoReplay(source: Uint8Array | BeatmapData, hash: string): ReplayData {
  const beatmap = source instanceof Uint8Array ? parseOsuBytes(source) : source;
  const stub = stubReplay(beatmap, hash);
  const modDiff = computeModDifficulty(beatmap, stub);

  if (beatmap.mode === 1) {
    return synthesizeAutoReplay(beatmap, hash, generateTaikoAutoReplay(beatmap, modDiff), 0);
  }
  if (beatmap.mode === 2) {
    const objects = convertBeatmapToCatch(beatmap, modDiff);
    applyPositionOffsets(objects, beatmap, modDiff);
    return synthesizeAutoReplay(beatmap, hash, generateCatchAutoReplay(objects, modDiff), 0);
  }
  if (beatmap.mode === 3) {
    return synthesizeAutoReplay(beatmap, hash, generateManiaAutoReplay(beatmap, modDiff), 0);
  }
  applyStacking(beatmap, modDiff);
  return synthesizeAutoReplay(beatmap, hash, generateStdAutoReplay(beatmap, modDiff), 0);
}

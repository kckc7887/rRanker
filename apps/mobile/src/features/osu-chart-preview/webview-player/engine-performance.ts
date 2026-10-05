import { createIntervalIndex } from '../../chart-preview-shared/webview-player/interval-index';
import type { HitResult } from './engine';
import type { ManiaHitObject, ManiaSession } from './engine/rulesets/mania/types';
import type { TaikoHitObject } from './engine/rulesets/taiko/types';

export type PreviewRenderOptions = {
  maniaIgnoreSV?: boolean;
  maniaTrackOpacity?: number;
  taikoTrackOpacity?: number;
};

export function resolveTrackOpacity(options: object, mode: 'mania' | 'taiko'): number {
  const value = (options as PreviewRenderOptions)[mode === 'mania' ? 'maniaTrackOpacity' : 'taikoTrackOpacity'];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

const constantManiaSessions = new WeakMap<ManiaSession, ManiaSession>();

export function maniaRenderSession(session: ManiaSession, options: object): ManiaSession {
  if (!(options as PreviewRenderOptions).maniaIgnoreSV) return session;
  let view = constantManiaSessions.get(session);
  if (!view) {
    view = { ...session, scroll: { times: [0], multipliers: [1], cumRaw: [0] } };
    constantManiaSessions.set(session, view);
  }
  return view;
}

const taikoLookbacks = new WeakMap<readonly TaikoHitObject[], number>();
export function taikoLookback(objects: readonly TaikoHitObject[]): number {
  let lookback = taikoLookbacks.get(objects);
  if (lookback !== undefined) return lookback;
  lookback = 500;
  for (const object of objects) if (object.kind !== 'hit') lookback = Math.max(lookback, object.endTime - object.time);
  lookback += 500;
  taikoLookbacks.set(objects, lookback);
  return lookback;
}

const maniaIndices = new WeakMap<readonly ManiaHitObject[], (min: number, max: number) => ManiaHitObject[]>();

export function visibleManiaObjects(objects: readonly ManiaHitObject[], minTime: number, maxTime: number): ManiaHitObject[] {
  let query = maniaIndices.get(objects);
  if (!query) {
    query = createIntervalIndex(objects, object => object.kind === 'note' ? [object.time, object.time] : [object.startTime, object.endTime]);
    maniaIndices.set(objects, query);
  }
  return query(minTime, maxTime);
}

type ResultIndex = { result: HitResult; displayTime: number; index: number };
const judgementIndices = new WeakMap<readonly HitResult[], { std?: ResultIndex[]; taiko?: ResultIndex[] }>();

export function visibleJudgements(results: readonly HitResult[], timeMs: number, taiko: boolean, lifetime: number): HitResult[] {
  let cache = judgementIndices.get(results);
  if (!cache) { cache = {}; judgementIndices.set(results, cache); }
  const mode = taiko ? 'taiko' : 'std';
  let entries = cache[mode];
  if (!entries) {
    entries = results.flatMap((result, index) => (taiko ? result.comboIgnore === true : result.isSliderSub === true || result.judgement === 300)
      ? [] : [{ result, index, displayTime: result.displayTime ?? result.time }]);
    entries.sort((a, b) => a.displayTime - b.displayTime || a.index - b.index);
    cache[mode] = entries;
  }
  let low = 0, high = entries.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (entries[mid]!.displayTime < timeMs - lifetime) low = mid + 1; else high = mid;
  }
  const visible: ResultIndex[] = [];
  for (let i = low; i < entries.length && entries[i]!.displayTime <= timeMs; i++) visible.push(entries[i]!);
  visible.sort((a, b) => a.index - b.index);
  return visible.map(entry => entry.result);
}

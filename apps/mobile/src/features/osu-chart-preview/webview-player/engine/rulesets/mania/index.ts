/*
 * Source: https://github.com/daladal/replayviewer-js
 * Adapted for fixed-speed chart preview.
 *
 * MIT License
 * 
 * Copyright (c) 2026 bog
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import type { BeatmapData, ReplayData, SkinAssets, HitResult } from '../../types/index';
import type { ModDifficulty } from '../../utils/modDifficulty';
import type { AccFrame, ComboFrame } from '../../renderer/HUDRenderer';
import type { ScoreFrame } from '../../utils/scoreProcessor';
import type { URTimeline } from '../../renderer/URBarRenderer';
import { computeManiaURTimeline } from '../../renderer/URBarRenderer';
import type { RenderOptions } from '../../renderer/Renderer';
import type { Ruleset } from '../Ruleset';
import type { ManiaSession } from './types';
import { convertBeatmapToMania, computeManiaBarLines } from './converter';
import { maniaFrames } from './input';
import { buildManiaLayout, drawManiaPlayfield, maniaSkinUpsideDown } from './Playfield';
import { buildManiaScroll } from './scroll';
import { computeManiaHitResults } from './hitJudge';
import {
  computeManiaScoreTimeline, computeManiaAccTimeline, computeManiaComboTimeline,
} from './scoreProcessor';

export type { ManiaSession } from './types';

/**
 * osu!mania ruleset implementation. `build` converts a native (mode 3) beatmap +
 * replay into an immutable {@link ManiaSession} (objects, input events, layout,
 * scroll table, judgements, score/acc/combo timelines); `draw` renders one frame
 * of the playfield at the given time. All timeline accessors return precomputed,
 * time-sorted arrays owned by the session.
 */
export const maniaRuleset: Ruleset<ManiaSession> = {
  build(
    beatmap: BeatmapData,
    replay: ReplayData,
    modDiff: ModDifficulty,
    skin: SkinAssets,
    _qualityTotal: number,
  ): ManiaSession {
    console.assert(
      beatmap.mode === 3,
      `maniaRuleset received unsupported beatmap.mode=${beatmap.mode}`,
    );
    const { stages, totalColumns, objects } = convertBeatmapToMania(beatmap, modDiff);
    const barLines = computeManiaBarLines(beatmap);
    const inputEvents = replay.mode === 3 ? maniaFrames(replay, totalColumns) : [];
    const layout = buildManiaLayout(stages, totalColumns, skin);
    const scroll = buildManiaScroll(beatmap);

    // Longest hold duration on the chart — drives the visible-range lookback
    // so long actively-held notes don't get culled when their start scrolled past.
    let maxHoldDurationMs = 0;
    for (const o of objects) {
      if (o.kind === 'hold') {
        const d = o.endTime - o.startTime;
        if (d > maxHoldDurationMs) maxHoldDurationMs = d;
      }
    }

    // Per-column press intervals — drive the key-receptor down sprites and stage press-lights.
    // Walk inputEvents (sorted by time globally) and pair press→release per column.
    // An unreleased column stays held to Infinity (rare; usually replay ends with a
    // final release frame).
    const pressIntervals: { start: number; end: number }[][] = Array.from(
      { length: totalColumns }, () => [],
    );
    const openPress: (number | null)[] = new Array(totalColumns).fill(null);
    for (const ev of inputEvents) {
      const col = ev.column;
      if (col < 0 || col >= totalColumns) continue;
      if (ev.kind === 'press') {
        if (openPress[col] === null) openPress[col] = ev.time;
      } else {
        const start = openPress[col];
        if (start !== null && start !== undefined) {
          pressIntervals[col]!.push({ start, end: ev.time });
          openPress[col] = null;
        }
      }
    }
    for (let c = 0; c < totalColumns; c++) {
      const start = openPress[c];
      if (start !== null && start !== undefined) {
        pressIntervals[c]!.push({ start, end: Number.POSITIVE_INFINITY });
      }
    }

    // sourceIndex → column lookup (for attributing hitResults to columns).
    const objectIndexToColumn = new Map<number, number>();
    for (const o of objects) objectIndexToColumn.set(o.sourceIndex, o.column);

    // sourceIndex → HitSample (so AudioSync can resolve per-press samples for both Notes
    // and HoldNote heads — holds aren't indexed in beatmap.hitObjects).
    const samplesBySource = new Map<number, typeof objects[number]['hitSample']>();
    for (const o of objects) samplesBySource.set(o.sourceIndex, o.hitSample);

    const preliminarySession: ManiaSession = {
      beatmap, replay, modDiff, skin,
      stages, totalColumns, defaultUpscroll: maniaSkinUpsideDown(skin, totalColumns),
      objects, barLines, inputEvents, layout, scroll, maxHoldDurationMs,
      pressIntervals, objectIndexToColumn, samplesBySource,
      holdStates:  new Map(),
      hitResults:  [],
      noteResultByIndex: new Map(),
      accFrames:   [],
      comboFrames: [],
      scoreFrames: [],
      urTimeline:  { hits: [], zones: [] },
    };
    const { results: hitResults, holdStates } = computeManiaHitResults(preliminarySession, modDiff);

    // Tap-note results only (HoldNote head/tail/body results carry a `subResult`
    // tag and are excluded). One entry per tap note's sourceIndex.
    const noteResultByIndex = new Map<number, typeof hitResults[number]>();
    for (const r of hitResults) {
      if (r.subResult === undefined) noteResultByIndex.set(r.objectIndex, r);
    }

    const accFrames   = computeManiaAccTimeline(hitResults, modDiff);
    const comboFrames = computeManiaComboTimeline(hitResults, objects, modDiff);
    const scoreFrames = computeManiaScoreTimeline(hitResults, objects, modDiff);
    const urTimeline  = computeManiaURTimeline(objects, hitResults, modDiff);

    return { ...preliminarySession, hitResults, holdStates, noteResultByIndex, accFrames, comboFrames, scoreFrames, urTimeline };
  },

  draw(ctx: CanvasRenderingContext2D, s: ManiaSession, timeMs: number, options: RenderOptions): void {
    drawManiaPlayfield(ctx, s, timeMs, options);
  },

  hitResults:  (s: ManiaSession): readonly HitResult[] => s.hitResults,
  scoreFrames: (s: ManiaSession): readonly ScoreFrame[] => s.scoreFrames,
  accFrames:   (s: ManiaSession): readonly AccFrame[]   => s.accFrames,
  comboFrames: (s: ManiaSession): readonly ComboFrame[] => s.comboFrames,
  urTimeline:  (s: ManiaSession): URTimeline             => s.urTimeline,
};

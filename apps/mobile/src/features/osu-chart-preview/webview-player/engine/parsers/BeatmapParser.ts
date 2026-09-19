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
import type { BeatmapData, HitObject, HitCircle, Slider, Spinner, ManiaHold, TimingPoint, HitSample } from '../types/index';

const DEFAULT_HIT_SAMPLE: HitSample = { normalSet: 0, additionSet: 0, index: 0, volume: 0, filename: '' };

function parseHitSample(raw: string): HitSample {
  if (raw === '' || raw === undefined) return DEFAULT_HIT_SAMPLE;
  const p = raw.split(':');
  return {
    normalSet:   parseInt(p[0] ?? '0', 10) || 0,
    additionSet: parseInt(p[1] ?? '0', 10) || 0,
    index:       parseInt(p[2] ?? '0', 10) || 0,
    volume:      parseInt(p[3] ?? '0', 10) || 0,
    filename:    (p[4] ?? '').trim(),
  };
}

/**
 * Parses `.osu` beatmap text into structured data: metadata, difficulty settings,
 * timing points (time-sorted, uninherited-first at equal times), breaks, and
 * time-sorted hit objects (mania hold notes land in the separate `maniaHolds` list).
 * Coordinates and slider lengths are in osu!pixels; all times are milliseconds.
 */
export function parseBeatmap(text: string): BeatmapData {
  const data: BeatmapData = {
    mode: 0,
    title: '',
    beatmapId: null,
    beatmapsetId: null,
    artist: '',
    version: '',
    audioFilename: '',
    audioLeadIn: 0,
    approachRate: 0,
    circleSize: 0,
    overallDifficulty: 0,
    hpDrainRate: 0,
    sliderMultiplier: 1,
    sliderTickRate: 1,
    stackLeniency: 0.7,
    formatVersion: 14,
    timingPoints: [],
    hitObjects: [],
    maniaHolds: [],
    breaks: [],
  };

  const lines = text.split(/\r?\n/);
  let section = '';

  // First non-empty line of an .osu file is `osu file format vN`.
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') continue;
    const m = /^osu file format v(\d+)\s*$/i.exec(line);
    if (m) data.formatVersion = parseInt(m[1] ?? '14', 10) || 14;
    break;
  }

  // Older .osu file formats (pre-v8) omit ApproachRate; osu! stable falls back
  // to OverallDifficulty in that case.  Track whether AR was explicitly set so
  // we can apply the fallback after the Difficulty section is fully parsed.
  let arExplicit = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('//')) continue;

    const sectionMatch = /^\[(\w+)\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1] ?? '';
      continue;
    }

    switch (section) {
      case 'General': {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) break;
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim();
        if (key === 'AudioFilename') data.audioFilename = val;
        else if (key === 'AudioLeadIn') data.audioLeadIn = parseInt(val, 10) || 0;
        else if (key === 'Mode') {
          const m = parseInt(val, 10);
          if (m === 0 || m === 1 || m === 2 || m === 3) data.mode = m;
        }
        else if (key === 'StackLeniency') {
          // `parseFloat(val) || 0.7` would clobber an explicit 0 (falsy) — maps
          // that disable stacking via `StackLeniency:0` need that to survive.
          const v = parseFloat(val);
          if (!isNaN(v)) data.stackLeniency = v;
        }
        break;
      }
      case 'Metadata': {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) break;
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim();
        if (key === 'Title') data.title = val;
        else if (key === 'Artist') data.artist = val;
        else if (key === 'Version') data.version = val;
        else if (key === 'BeatmapID' || key === 'BeatmapSetID') {
          const id = /^\d+$/.test(val) ? Number(val) : NaN;
          const valid = Number.isSafeInteger(id) && id > 0 ? id : null;
          if (key === 'BeatmapID') data.beatmapId = valid;
          else data.beatmapsetId = valid;
        }
        break;
      }
      case 'Difficulty': {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) break;
        const key = line.slice(0, colonIdx).trim();
        const val = parseFloat(line.slice(colonIdx + 1).trim());
        if (key === 'HPDrainRate') data.hpDrainRate = val;
        else if (key === 'CircleSize') data.circleSize = val;
        else if (key === 'OverallDifficulty') data.overallDifficulty = val;
        else if (key === 'ApproachRate') { data.approachRate = val; arExplicit = true; }
        else if (key === 'SliderMultiplier') data.sliderMultiplier = val;
        else if (key === 'SliderTickRate') data.sliderTickRate = val;
        break;
      }
      case 'Events': {
        // Only break rows are consumed here. Event rows: `type,startTime,...`.
        // Break is type `2` (numeric) or `Break` (string form). Both are valid.
        const parts = line.split(',');
        if (parts.length < 3) break;
        const kind = (parts[0] ?? '').trim();
        if (kind !== '2' && kind.toLowerCase() !== 'break') break;
        const startTime = parseInt(parts[1] ?? '0', 10);
        const endTime   = parseInt(parts[2] ?? '0', 10);
        if (!isNaN(startTime) && !isNaN(endTime) && endTime > startTime) {
          data.breaks.push({ startTime, endTime });
        }
        break;
      }
      case 'TimingPoints': {
        const parts = line.split(',');
        // Minimum: time + beatLength.  Old format versions (< v7) have only 2–5
        // fields and have no inherited (SV) points, so parts[6] defaults to '1'
        // (uninherited) via the ?? fallback below — which is correct.
        // Format: time,beatLength,meter,sampleSet,sampleIndex,volume,uninherited,effects
        //         [0]  [1]        [2]   [3]        [4]         [5]    [6]         [7]
        if (parts.length < 2) break;
        const time = parseInt(parts[0] ?? '0', 10);
        const beatLength = parseFloat(parts[1] ?? '0');
        const meter = parseInt(parts[2] ?? '4', 10);
        const uninherited = parseInt(parts[6] ?? '1', 10);
        const effects = parseInt(parts[7] ?? '0', 10);
        // Sample volume (field 5): default 100 when absent/blank, clamped 0–100
        // (matches lazer's BindableInt range). Volume 0 is valid (near-mute).
        const rawVol = parseInt(parts[5] ?? '', 10);
        const volume = Number.isFinite(rawVol) ? Math.max(0, Math.min(100, rawVol)) : 100;
        const tp: TimingPoint = {
          time,
          beatLength,
          meter,
          inherited: uninherited === 0,
          sampleSet:   parseInt(parts[3] ?? '0', 10) || 0,
          sampleIndex: parseInt(parts[4] ?? '0', 10) || 0,
          volume,
          kiai: (effects & 1) !== 0,
        };
        data.timingPoints.push(tp);
        break;
      }
      case 'HitObjects': {
        const parts = line.split(',');
        if (parts.length < 5) break;
        const x = parseInt(parts[0] ?? '0', 10);
        const y = parseInt(parts[1] ?? '0', 10);
        const time = parseInt(parts[2] ?? '0', 10);
        const typeFlags = parseInt(parts[3] ?? '0', 10);
        const hitSound = parseInt(parts[4] ?? '0', 10);

        const newCombo  = (typeFlags & 4) !== 0;
        const comboSkip = (typeFlags >> 4) & 0x7;

        let obj: HitObject | null = null;

        if (typeFlags & 1) {
          const circle: HitCircle = {
            type: 'circle', x, y, time, hitSound,
            hitSample: parseHitSample(parts[5] ?? ''),
            newCombo, comboSkip,
            stackHeight: 0,
          };
          obj = circle;
        } else if (typeFlags & 2) {
          const curveRaw = parts[5] ?? '';
          const slides = parseInt(parts[6] ?? '1', 10);
          const length = parseFloat(parts[7] ?? '0');

          const pipeParts = curveRaw.split('|');
          const curveTypeChar = (pipeParts[0] ?? 'B').trim();
          const curveType = (['B', 'L', 'P', 'C'].includes(curveTypeChar)
            ? curveTypeChar
            : 'B') as 'B' | 'L' | 'P' | 'C';

          const curvePoints: { x: number; y: number }[] = [{ x, y }];
          for (let i = 1; i < pipeParts.length; i++) {
            const cp = pipeParts[i]?.split(':');
            if (cp && cp.length >= 2) {
              curvePoints.push({
                x: parseInt(cp[0] ?? '0', 10),
                y: parseInt(cp[1] ?? '0', 10),
              });
            }
          }

          const edgeSoundsRaw = parts[8] ?? '';
          const edgeSounds: number[] = edgeSoundsRaw !== ''
            ? edgeSoundsRaw.split('|').map(s => parseInt(s, 10) || 0)
            : [];
          while (edgeSounds.length < slides + 1) edgeSounds.push(hitSound);

          const edgeSetsRaw = parts[9] ?? '';
          const edgeSets: { normalSet: number; additionSet: number }[] = [];
          if (edgeSetsRaw !== '') {
            for (const entry of edgeSetsRaw.split('|')) {
              const [ns, as] = entry.split(':');
              edgeSets.push({
                normalSet:   parseInt(ns ?? '0', 10) || 0,
                additionSet: parseInt(as ?? '0', 10) || 0,
              });
            }
          }
          while (edgeSets.length < slides + 1) edgeSets.push({ normalSet: 0, additionSet: 0 });

          const slider: Slider = {
            type: 'slider',
            x, y, time,
            curveType,
            curvePoints,
            slides,
            length,
            hitSound,
            hitSample: parseHitSample(parts[10] ?? ''),
            newCombo,
            comboSkip,
            edgeSounds,
            edgeSets,
            stackHeight: 0,
          };
          obj = slider;
        } else if (typeFlags & 8) {
          const endTime = parseInt(parts[5] ?? '0', 10);
          const spinner: Spinner = {
            type: 'spinner', time, endTime, hitSound,
            hitSample: parseHitSample(parts[6] ?? ''),
          };
          obj = spinner;
        } else if (typeFlags & 128) {
          // Mania hold note: `x,y,time,type,hitSound,endTime:normalSet:additionSet:index:volume:filename`.
          // The endTime + sample share parts[5] separated by ':' (unlike spinner which uses ',').
          // Holds go into the parallel maniaHolds bucket so the std HitObject union stays narrow.
          const tailRaw = parts[5] ?? '';
          const colon = tailRaw.indexOf(':');
          const endTime = parseInt(colon === -1 ? tailRaw : tailRaw.slice(0, colon), 10);
          const sampleRaw = colon === -1 ? '' : tailRaw.slice(colon + 1);
          const hold: ManiaHold = {
            type: 'hold', x, time, endTime, hitSound,
            hitSample: parseHitSample(sampleRaw),
          };
          data.maniaHolds.push(hold);
        }

        if (obj !== null) data.hitObjects.push(obj);
        break;
      }
    }
  }

  if (!arExplicit) data.approachRate = data.overallDifficulty;

  // At equal times, uninherited (BPM) must precede inherited (SV) or sliders compute too slow.
  data.timingPoints.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    if (!a.inherited && b.inherited) return -1;
    if (a.inherited && !b.inherited) return  1;
    return 0;
  });

  // Stable sort preserves file order for 2B notelock and combo numbering.
  data.hitObjects.sort((a, b) => a.time - b.time);

  return data;
}

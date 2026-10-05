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

function requireFinite(value: number, field: string): number {
  if (!Number.isFinite(value)) throw new Error(`谱面数值无效：${field}`);
  return value;
}

function requireTime(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('谱面时间无效');
  return value;
}

function timingBeatLength(raw: string, inherited: boolean): number {
  /** osu! 时间点中的 NaN 表示正常速度但禁用 tick。 */
  if (inherited && raw.trim().toLowerCase() === 'nan') return NaN;
  const value = requireFinite(parseFloat(raw), 'BeatLength');
  if (!inherited && value <= 0) throw new Error('谱面节拍长度无效');
  return value;
}

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

function sliderDimensions(parts: string[]): { slides: number; length: number } {
  const slides = Number(parts[6] ?? '1');
  const length = Number(parts[7] ?? '0');
  if (!Number.isSafeInteger(slides) || slides < 1) throw new Error('滑条重复次数无效');
  if (!Number.isFinite(length) || length < 0) throw new Error('滑条长度无效');
  return { slides, length };
}

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

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') continue;
    const m = /^osu file format v(\d+)\s*$/i.exec(line);
    if (m) data.formatVersion = parseInt(m[1] ?? '14', 10) || 14;
    break;
  }

  /** pre-v8 .osu 缺少 AR 时按 OD 处理。 */

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
          /** StackLeniency 的显式 0 表示禁用堆叠。 */

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
        /** 休息段接受类型 2 或 Break。 */

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
        /** pre-v7 时间点没有 SV 字段，缺项按 uninherited 处理。 */

        if (parts.length < 2) break;
        const time = parseInt(parts[0] ?? '0', 10);
        const meter = parseInt(parts[2] ?? '4', 10);
        const uninherited = parseInt(parts[6] ?? '1', 10);
        const beatLength = timingBeatLength(parts[1] ?? '0', uninherited === 0);
        requireTime(time);
        const effects = parseInt(parts[7] ?? '0', 10);
        /** 时间点音量 0 有效；缺省为 100。 */

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
        requireFinite(x, 'x');
        requireFinite(y, 'y');
        requireTime(time);

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
          const { slides, length } = sliderDimensions(parts);

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
                x: requireFinite(parseInt(cp[0] ?? '0', 10), 'control x'),
                y: requireFinite(parseInt(cp[1] ?? '0', 10), 'control y'),
              });
            }
          }

          const edgeSoundsRaw = parts[8] ?? '';
          const edgeSounds: number[] = edgeSoundsRaw !== ''
            ? edgeSoundsRaw.split('|').map(s => parseInt(s, 10) || 0)
            : [];

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
          const endTime = requireTime(parseInt(parts[5] ?? '0', 10));
          const spinner: Spinner = {
            type: 'spinner', time, endTime, hitSound,
            hitSample: parseHitSample(parts[6] ?? ''),
          };
          obj = spinner;
        } else if (typeFlags & 128) {
          /** mania 长押的结束时间与音色位于同一冒号分隔字段。 */

          const tailRaw = parts[5] ?? '';
          const colon = tailRaw.indexOf(':');
          const endTime = requireTime(parseInt(colon === -1 ? tailRaw : tailRaw.slice(0, colon), 10));
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
  for (const field of ['hpDrainRate', 'circleSize', 'overallDifficulty', 'approachRate', 'sliderMultiplier', 'sliderTickRate', 'stackLeniency'] as const) {
    requireFinite(data[field], field);
  }
  if (data.sliderMultiplier <= 0 || data.sliderTickRate <= 0) throw new Error('谱面滑条倍率无效');

  /** 同时间先处理 BPM 再处理 SV，否则滑条速度错误。 */
  data.timingPoints.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    if (!a.inherited && b.inherited) return -1;
    if (a.inherited && !b.inherited) return  1;
    return 0;
  });

  /** 保留同时间音符的文件顺序，供 notelock 与 combo 使用。 */
  data.hitObjects.sort((a, b) => a.time - b.time);

  return data;
}

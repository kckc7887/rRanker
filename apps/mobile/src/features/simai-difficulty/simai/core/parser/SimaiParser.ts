/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
import type {AvailableDifficulties, BaseNote, Chart, ChartDifficulty, DivisionSpec, Note} from '../../types';
import {TimingTimeline} from '../timing/TimingTimeline';
import {numberValue, scan, SimaiParseError, SourceMap, type Lexeme} from './lexical';
import {readNote} from './notes';
export {SimaiParseError} from './lexical';
export {parseDuration} from './duration';

type Field = {value: string; offset: number};
function fields(text: string): Map<string, Field> {
  const result = new Map<string, Field>();
  const headers = [...text.matchAll(/^\s*&([\w]+)\s*=/gm)];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!, offset = h.index! + h[0].length;
    result.set(h[1]!.toLowerCase(), {value: text.slice(offset, headers[i + 1]?.index ?? text.length), offset});
  }
  return result;
}
export function getAvailableDifficulties(text: string): AvailableDifficulties {
  const meta = fields(text), result: AvailableDifficulties = {};
  for (let i = 1; i <= 7; i++) if (meta.has(`inote_${i}`)) result[i] = true;
  return result;
}
export function* parseSimaiChart(shouldYield: () => boolean, text: string, difficulty?: ChartDifficulty | number): Generator<void, Chart, void> {
  const meta = fields(text), available = getAvailableDifficulties(text);
  const slot = difficulty ?? Math.max(...Object.keys(available).map(Number));
  const body = meta.get(`inote_${slot}`);
  if (!body) throw new Error(`inote_${slot} not found`);
  const bpmText = meta.get('bpm')?.value.trim();
  const chart = (yield* parseSimaiBody(shouldYield, body.value, bpmText ? Number(bpmText) : undefined, text, body.offset));
  chart.difficulty = slot;
  chart.availableDifficulties = available;
  chart.title = meta.get('title')?.value.trim() ?? '';
  chart.artist = meta.get('artist')?.value.trim() ?? '';
  chart.designer = (meta.get(`des_${slot}`) ?? meta.get('des'))?.value.trim() ?? '';
  for (const [key, field] of meta) { if (shouldYield()) yield;
    if (/^lv_\d+$/.test(key)) chart.level[key] = field.value.trim();
    if (/^des_\d+$/.test(key)) chart.designers[key] = field.value.trim();
  }
  const first = meta.get('first')?.value.trim();
  if (first) {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(first) || !Number.isFinite(Number(first)))
      throw new Error('Invalid first offset');
    chart.firstMs = Number(first) * 1000;
  }
  return chart;
}

/** Streaming notation clock; commas advance time, whitespace never does. */
export function* parseSimaiBody(shouldYield: () => boolean, body: string, defaultBpm?: number, sourceText = body, sourceOffset = 0): Generator<void, Chart, void> {
  const map = yield* SourceMap.create(shouldYield, sourceText);
  const chart: Chart = {title:'', artist:'', designer:'', level:{}, designers:{}, availableDifficulties:{},
    bpm:0, firstMs:0, durationMs:0, measures:0, notes:[], bpmEvents:[], divisorEvents:[], scrollEvents:[], signatures:[]};
  let bpm = defaultBpm ?? 0, beat = 0, time = 0, divisor = 4, group = 0, hs = 1, velocity = 1;
  let initialBpm = 0, previousVelocity: number | undefined;
  let division: DivisionSpec = {raw:'{4}', mode:'division', divisor:4};
  let pending: Lexeme | undefined;
  const flush = function* ()  {
    if (!(bpm > 0) || !Number.isFinite(bpm)) throw new SimaiParseError('Invalid or missing BPM', map.at(sourceOffset, body.slice(0,40)));
    initialBpm ||= bpm;
    if (previousVelocity !== velocity) {chart.scrollEvents.push({timeMs:time, velocity}); previousVelocity = velocity;}
    if (!pending) return;
    let tokenOffset = 0, fake = 0;
    for (const simultaneous of pending.value.split('`')) { if (shouldYield()) yield;
      if (!simultaneous) {tokenOffset++; continue;}
      const batch: Note[] = [];
      let local = 0;
      for (const expression of simultaneous.split('/')) { if (shouldYield()) yield;
        if (expression) {
          const start = pending.offsets[tokenOffset + local]!;
          const end = pending.offsets[tokenOffset + local + expression.length - 1]! + 1;
          const base: BaseNote = {id:0, position:1, timing:beat + fake * bpm / 60000,
            timingMs:time + fake, endTimeMs:time + fake, bpm, declaredDivisor:divisor, divisionSpec:{...division},
            pseudoEachOffsetMs:fake, scoreBeat:beat + fake * bpm / 60000, group, hiSpeed:hs, usingSV:true,
            isBreak:false, isEx:false, isMine:false, isEach:false, isSlideEach:false, isForceStar:false, isFakeRotate:false,
            source:map.at(start, sourceText.slice(start,end))};
          const notes = yield* readNote(shouldYield, expression, base);
          for (let i = 0; i < notes.length; i++) {
            batch.push(notes[i]!);
            if ((i & 63) === 63 && shouldYield()) yield;
          }
        }
        local += expression.length + 1;
      }
      let heads = 0, slides = 0;
      for (let i = 0; i < batch.length; i++) {
        const note = batch[i]!;
        if (!note.isMine && !(note.type === 'slide' && note.isHeadless)) heads++;
        if (note.type === 'slide') for (const branch of note.branches) { if (!branch.isMine) slides++; if (shouldYield()) yield; }
        if ((i & 63) === 63 && shouldYield()) yield;
      }
      const each = heads > 1, slideEach = slides > 1;
      for (const note of batch) { if (shouldYield()) yield;note.id = chart.notes.length; note.isEach = each; note.isSlideEach = slideEach; chart.notes.push(note);}
      group++; fake++; tokenOffset += simultaneous.length + 1;
    }
    pending = undefined;
  };
  for (const token of scan(shouldYield,body,map,sourceOffset)) { if (shouldYield()) yield;
    if (!token) continue;
    const source = map.at(token.offsets[0]!,token.value);
    switch (token.kind) {
      case 'notes': pending = token; break;
      case 'comma': (yield* flush()); beat += 4 / divisor; time += 240000 / bpm / divisor; break;
      case 'bpm':
        bpm = numberValue(token.value.slice(1,-1),source,true);
        chart.bpmEvents.push({timing:beat,bpm});
        if (division.mode === 'seconds-compat') {
          divisor = 240000 / bpm / (division.seconds! * 1000);
          division = {...division, divisor};
        }
        break;
      case 'division': {
        const expression = token.value.slice(1,-1).replace(/\s/g,''), seconds = expression.startsWith('#') ? numberValue(expression.slice(1),source,true) : undefined;
        divisor = seconds === undefined ? numberValue(expression,source,true) : 240000 / bpm / (seconds * 1000);
        division = {raw:token.value, mode:seconds === undefined ? 'division':'seconds-compat', divisor,
          ...(seconds === undefined ? {} : {seconds})};
        chart.divisorEvents.push({timing:beat,divisor,spec:{...division}});
        break;
      }
      case 'speed': {
        const n = numberValue(token.value.slice(4,-1),source,true);
        if (token.value.startsWith('<HS')) hs = n; else velocity = n;
        break;
      }
      case 'signature': {
        const [numerator,denominator] = token.value.split('/').map(Number);
        chart.signatures.push({timeMs:time,numerator:numerator!,denominator:denominator!});
        break;
      }
    }
  }
  if (pending) (yield* flush());
  initialBpm ||= bpm;
  if (!(initialBpm > 0)) throw new SimaiParseError('Invalid or missing BPM',map.at(sourceOffset,body.slice(0,40)));
  const lead = 240000 / initialBpm;
  chart.bpm = initialBpm;
  for (const note of chart.notes) { if (shouldYield()) yield;note.timing += 4; note.timingMs += lead; note.endTimeMs += lead;}
  for (const event of chart.bpmEvents) { if (shouldYield()) yield; event.timing += 4; }
  for (const event of chart.divisorEvents) { if (shouldYield()) yield; event.timing += 4; }
  for (const event of [...chart.scrollEvents,...chart.signatures]) { if (shouldYield()) yield; event.timeMs += lead; }
  const timeline = TimingTimeline.fromChart(chart);
  for (const note of chart.notes) { if (shouldYield()) yield; note.scoreBeat = timeline.scoreBeatFromChartMs(note.timingMs); }
  chart.measures = Math.ceil(beat / 4) + 2;
  let end = time + lead;
  for (let i = 0; i < chart.notes.length; i++) {
    end = Math.max(end, chart.notes[i]!.endTimeMs);
    if ((i & 63) === 63 && shouldYield()) yield;
  }
  chart.durationMs = end + lead;
  return chart;
}

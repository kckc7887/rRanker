/** Adapted from MajSimai 334f3b4141cbc204814bccb9f3e1cea7c1b14594 (GPL-3.0-or-later).
 * Copyright bbben, Lezi, Moying. TypeScript port adds source diagnostics and LXNS slots.
 * See THIRD_PARTY_NOTICES.md.
 */
import type { AvailableDifficulties, BaseNote, ButtonPosition, Chart, ChartDifficulty, Note, SlideBranch, SlideSegment, SourceLocation, TouchPosition } from '../../types';

export class SimaiParseError extends Error {
  constructor(message: string, public readonly source: SourceLocation) {
    super(`${message} (${source.line}:${source.column}: ${source.text})`);
    this.name = 'SimaiParseError';
  }
}
function location(text: string, offset: number, token: string): SourceLocation {
  const prefix = text.slice(0, offset).split('\n');
  return { offset, line: prefix.length, column: prefix[prefix.length - 1].length + 1, text: token };
}
function fail(message: string, source: SourceLocation): never { throw new SimaiParseError(message, source); }
function number(value: string, source: SourceLocation, positive = false): number {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) fail('Invalid number', source);
  const n = Number(value);
  if (!Number.isFinite(n) || (positive && n <= 0)) fail('Invalid value', source);
  return n;
}
function ratio(value: string, bpm: number, source: SourceLocation): number {
  const parts = value.split(':');
  if (parts.length !== 2) fail('Expected division:beats', source);
  const result = 240000 / bpm / number(parts[0], source, true) * number(parts[1], source);
  if (result < 0) fail('Negative duration', source);
  return result;
}
export function parseDuration(value: string, bpm: number, slide: boolean, source: SourceLocation): { durationMs: number; delayMs?: number } {
  let durationMs: number, delayMs: number | undefined;
  if (slide && value.includes('##')) {
    const [wait, duration, extra] = value.split('##');
    if (extra !== undefined) fail('Invalid slide duration', source);
    delayMs = number(wait, source) * 1000;
    if (duration.includes('#')) {
      const [localBpm, beats, invalid] = duration.split('#');
      if (invalid !== undefined) fail('Invalid slide duration', source);
      durationMs = ratio(beats, number(localBpm, source, true), source);
    } else durationMs = duration.includes(':') ? ratio(duration, bpm, source) : number(duration, source) * 1000;
  } else if (value.includes('#')) {
    const [localBpm, duration, extra] = value.split('#');
    if (extra !== undefined) fail('Invalid duration', source);
    if (localBpm === '') {
      // LXNS supplies [#seconds] slides as well as holds.
      durationMs = number(duration, source) * 1000;
    } else {
      const tempo = number(localBpm, source, true);
      durationMs = duration.includes(':') ? ratio(duration, tempo, source) : number(duration, source) * 1000;
      if (slide) delayMs = 60000 / tempo;
    }
  } else durationMs = ratio(value, bpm, source);
  if (durationMs < 0 || (delayMs !== undefined && delayMs < 0)) fail('Negative duration', source);
  return { durationMs, delayMs };
}
function branch(raw: string, start: ButtonPosition, bpm: number, source: SourceLocation): SlideBranch {
  const path = raw.slice(raw.search(/[-<>^vpqszwVABCPQK]/));
  let isBreak = false, isMine = false;
  const clean = path.replace(/[bm]/g, (flag: string, index: number) => {
    if (index === path.length - 1 || path[index + 1] === '[') {
      if (flag === 'b') isBreak = true; else isMine = true;
    }
    return '';
  }).replace(/[xc!?@$]/g, '');
  const segments: SlideSegment[] = [];
  let pos = 0, previous = start, totalDuration = 0;
  let delayMs: number | undefined;
  while (pos < clean.length) {
    const rest = clean.slice(pos), custom = /^[ABCPQK]/.test(rest);
    const match = custom ? rest.match(/^([ABCPQK0-9]*?K([1-8]))/) : rest.match(/^(pp|qq|[-<>^vpqszwV])([1-8])([1-8])?/);
    if (!match) fail('Invalid slide path', source);
    let code: string, end: ButtonPosition, mid: ButtonPosition | undefined;
    if (custom) { code = `${previous}${match[1]}`; end = Number(match[2]) as ButtonPosition; }
    else {
      if (match[1] !== 'V' && match[3]) fail('Unexpected slide digit', source);
      if (match[1] === 'V' && !match[3]) fail('Missing V turning point', source);
      mid = match[1] === 'V' ? Number(match[2]) as ButtonPosition : undefined;
      end = Number(match[3] ?? match[2]) as ButtonPosition;
      code = `${previous}${match[0]}`;
    }
    pos += match[0].length;
    let durationMs: number | null = null;
    if (clean[pos] === '[') {
      const closing = clean.indexOf(']', pos);
      if (closing < 0) fail('Unclosed duration', source);
      const parsed = parseDuration(clean.slice(pos + 1, closing), bpm, true, source);
      durationMs = parsed.durationMs; delayMs ??= parsed.delayMs;
      totalDuration += durationMs; pos = closing + 1;
    }
    segments.push({ type: custom ? 'custom' : match[1] as SlideSegment['type'], startPos: previous, endPos: end, midPos: mid, code, durationMs });
    previous = end;
  }
  const durations = segments.filter(s => s.durationMs !== null);
  if (!segments.length || !durations.length) fail('Missing slide duration', source);
  if (!(durations.length === 1 && segments[segments.length - 1].durationMs !== null) && durations.length !== segments.length) fail('Mixed connected-slide durations', source);
  if (segments.length > 1 && segments.some(s => s.type === 'w')) fail('Wifi cannot be connected', source);
  return { segments, durationMs: totalDuration, delayMs: delayMs ?? 60000 / bpm, isBreak, isMine };
}
function parseNote(raw: string, base: BaseNote): Note[] {
  if (/^[1-8]{2,}$/.test(raw)) return [...raw].flatMap(digit => parseNote(digit, base));
  const touch = raw.match(/^([ABCDE])([1-8])?/);
  let position: ButtonPosition | TouchPosition, rest: string;
  if (touch) {
    if (touch[1] !== 'C' && !touch[2]) fail('Missing touch position', base.source);
    position = (touch[1] === 'C' ? 'C' : touch[0]) as TouchPosition;
    rest = raw.slice(touch[0].length);
  } else {
    if (!/^[1-8]/.test(raw)) fail('Invalid note', base.source);
    position = Number(raw[0]) as ButtonPosition; rest = raw.slice(1);
  }
  const pathStart = touch ? -1 : rest.replace(/\[[^\]]*\]/g, match => ' '.repeat(match.length)).search(/[-<>^vpqszwVABCPQK]/);
  const flags = pathStart < 0 ? rest.replace(/\[[^\]]*\]/g, '') : rest.slice(0, pathStart);
  if (!/^[hbxmfc!?@$]*$/.test(flags)) fail('Unknown note modifier', base.source);
  const allFlags = rest.split('*')[0].replace(/\[[^\]]*\]/g, '');
  const common: BaseNote = { ...base, position, isBreak: flags.includes('b'), isEx: allFlags.includes('x'), isMine: flags.includes('m'), usingSV: !allFlags.includes('c'), isForceStar: allFlags.includes('$'), isFakeRotate: (allFlags.match(/\$/g)?.length ?? 0) > 1 };
  if (pathStart >= 0) {
    if (flags.includes('h')) fail('Hold cannot have slide paths', base.source);
    const paths = raw.split('*');
    const branches = paths.map((part, i) => branch(i ? `${position}${part}` : part, position as ButtonPosition, base.bpm, base.source));
    const endTimeMs = Math.max(...branches.map(b => base.timingMs + b.delayMs + b.durationMs));
    return [{ ...common, position: position as ButtonPosition, type: 'slide', isStartBreak: common.isBreak, isHeadless: /[!?]/.test(allFlags), headlessMode: allFlags.includes('!') ? 'pop' : 'fade', isTapHead: allFlags.includes('@'), branches, endTimeMs }];
  }
  const duration = rest.match(/\[([^\]]*)\]/);
  if (/\[.*\[|\].*\]/.test(rest)) fail('Invalid duration', base.source);
  if (flags.includes('h')) {
    const durationMs = duration ? parseDuration(duration[1], base.bpm, false, base.source).durationMs : 0;
    const hold = { ...common, durationMs, duration: durationMs * base.bpm / 60000, endTimeMs: base.timingMs + durationMs, isHoldStart: true as const };
    return [touch ? { ...hold, type: 'touch-hold-start', position: position as TouchPosition, hasFirework: flags.includes('f') } : { ...hold, type: 'hold-start', position: position as ButtonPosition, isBreakHold: common.isBreak }];
  }
  if (duration) fail('Duration without hold or slide', base.source);
  if (touch) return [{ ...common, type: 'touch', position: position as TouchPosition, hasFirework: flags.includes('f') }];
  return [{ ...common, type: common.isBreak ? 'break' : 'tap', position: position as ButtonPosition, isStar: flags.includes('$'), isSpinningStar: flags.includes('$$') }];
}
function metadata(text: string) {
  const fields: Record<string, { value: string; offset: number }> = {};
  const markers = [...text.matchAll(/^\s*&([\w]+)\s*=/gm)];
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i], start = m.index! + m[0].length;
    fields[m[1].toLowerCase()] = { value: text.slice(start, markers[i + 1]?.index ?? text.length), offset: start };
  }
  return fields;
}
export function getAvailableDifficulties(text: string): AvailableDifficulties {
  const fields = metadata(text), result: AvailableDifficulties = {};
  for (let i = 1; i <= 6; i++) if (fields[`inote_${i}`]) result[i as ChartDifficulty] = true;
  return result;
}
export function parseSimaiChart(text: string, difficulty?: ChartDifficulty | number): Chart {
  const fields = metadata(text);
  const slots = Object.keys(fields).filter(k => /^inote_\d+$/.test(k)).map(k => Number(k.slice(6)));
  const slot = difficulty ?? Math.max(0, ...slots.filter(n => n <= 7));
  const body = fields[`inote_${slot}`];
  if (!body) throw new Error(`Difficulty ${slot} not found in chart. Available: ${slots.join(', ')}`);
  const chart = parseSimaiBody(body.value, Number(fields.bpm?.value.trim()) || undefined, text, body.offset);
  chart.title = fields.title?.value.trim() ?? ''; chart.artist = fields.artist?.value.trim() ?? '';
  chart.designer = fields[`des_${slot}`]?.value.trim() ?? fields.des?.value.trim() ?? '';
  chart.difficulty = slot; chart.availableDifficulties = getAvailableDifficulties(text);
  chart.firstMs = fields.first ? number(fields.first.value.trim(), location(text, fields.first.offset, fields.first.value)) * 1000 : 0;
  for (const [key, field] of Object.entries(fields)) {
    if (key.startsWith('lv_')) chart.level[key] = field.value.trim();
    if (key.startsWith('des_')) chart.designers[key] = field.value.trim();
  }
  return chart;
}
export function parseSimaiBody(body: string, defaultBpm?: number, sourceText = body, sourceOffset = 0): Chart {
  let bpm = defaultBpm ?? 0, initialBpm = 0, beat = 0, timeMs = 0, division = 4, hs = 1, sv = 1, group = 0;
  const chart: Chart = { title: '', artist: '', designer: '', bpm: 0, level: {}, designers: {}, availableDifficulties: {}, notes: [], bpmEvents: [], divisorEvents: [], scrollEvents: [], signatures: [], firstMs: 0, measures: 0, durationMs: 0 };
  let token = '', tokenStart = 0, tokenOffsets: number[] = [];
  const src = (i: number, value: string) => location(sourceText, sourceOffset + i, value);
  const flush = () => {
    if (!initialBpm && bpm > 0) initialBpm = bpm;
    if (!(bpm > 0)) fail('Missing BPM', src(tokenStart, token));
    if (chart.scrollEvents[chart.scrollEvents.length - 1]?.velocity !== sv) chart.scrollEvents.push({ timeMs, velocity: sv });
    let fake = 0, eachOffset = 0;
    for (const each of token.split('`')) {
      if (!each) { eachOffset++; continue; }
      const timingMs = timeMs + fake * 1875 / bpm;
      const base: BaseNote = { id: 0, position: 1, timing: beat + fake / 32, timingMs, endTimeMs: timingMs, bpm, hiSpeed: hs, usingSV: true, isBreak: false, isEx: false, isMine: false, isEach: false, isSlideEach: false, isForceStar: false, isFakeRotate: false, group: group++, source: src(tokenOffsets[eachOffset] ?? tokenStart, each) };
      let partOffset = eachOffset;
      const notes = each.split('/').flatMap(part => {
        if (!part) fail('Empty each note', base.source);
        const parsed = parseNote(part, { ...base, source: src(tokenOffsets[partOffset] ?? tokenStart, part) });
        partOffset += part.length + 1; return parsed;
      });
      const heads = notes.filter(n => !n.isMine && !(n.type === 'slide' && n.isHeadless)).length;
      const slides = notes.flatMap(n => n.type === 'slide' ? n.branches : []).filter(b => !b.isMine).length;
      for (const note of notes) { note.id = chart.notes.length; note.isEach = heads > 1; note.isSlideEach = slides > 1; chart.notes.push(note); }
      fake++; eachOffset += each.length + 1;
    }
    token = ''; tokenOffsets = [];
  };
  for (let i = 0; i < body.length;) {
    const c = body[i];
    if (/\s/.test(c)) { i++; continue; }
    if (body.startsWith('||', i)) {
      const end = body.indexOf('\n', i), limit = end < 0 ? body.length : end;
      const comment = body.slice(i + 2, limit);
      if (comment.startsWith('s')) {
        const signature = comment.slice(1).trim().split('/');
        if (signature.length !== 2) fail('Invalid signature', src(i, comment));
        chart.signatures.push({ timeMs, numerator: number(signature[0], src(i, comment), true), denominator: number(signature[1], src(i, comment), true) });
      }
      i = limit; continue;
    }
    const command = body.slice(i).match(/^(\([^)]*\)|\{[^}]*\}|<(?:HS|SV)\*[^>]*>)/i);
    if (command) {
      const value = command[0], origin = src(i, value);
      if (value[0] === '(') { bpm = number(value.slice(1, -1), origin, true); chart.bpmEvents.push({ timing: beat, bpm }); }
      else if (value[0] === '{') {
        division = value[1] === '#' ? 240000 / bpm / (number(value.slice(2, -1), origin, true) * 1000) : number(value.slice(1, -1), origin, true);
        if (!Number.isFinite(division)) fail('Missing BPM', origin);
        chart.divisorEvents.push({ timing: beat, divisor: division });
      } else if (value.slice(1, 3).toUpperCase() === 'HS') hs = number(value.slice(4, -1), origin);
      else sv = number(value.slice(4, -1), origin);
      i += value.length; continue;
    }
    if (c === ',') { flush(); timeMs += 240000 / bpm / division; beat += 4 / division; i++; continue; }
    if (c === 'E' && !token && /^E(?:\s|,|$)/.test(body.slice(i))) { i++; continue; }
    if (!token) tokenStart = i;
    token += c; tokenOffsets.push(i); i++;
  }
  if (token) flush();
  if (!(initialBpm > 0)) initialBpm = bpm;
  if (!(initialBpm > 0)) fail('Missing BPM', src(0, body.slice(0, 30)));
  const lead = 240000 / initialBpm;
  for (const n of chart.notes) { n.timing += 4; n.timingMs += lead; n.endTimeMs += lead; }
  for (const e of chart.bpmEvents) e.timing += 4;
  for (const e of chart.divisorEvents) e.timing += 4;
  for (const e of chart.scrollEvents) e.timeMs += lead;
  for (const e of chart.signatures) e.timeMs += lead;
  chart.bpm = initialBpm;
  chart.durationMs = chart.notes.reduce((end, n) => Math.max(end, n.endTimeMs), timeMs + lead) + lead;
  chart.measures = Math.ceil(beat / 4) + 2;
  return chart;
}
export interface BuddyCharts { side1: Chart; side2: Chart }
export function parseSimaiSideChart(text: string, side: 0 | 1): Chart {
  const slot = side ? 102 : 2;
  if (!metadata(text)[`inote_${slot}`]) throw new Error(`Buddy 谱面缺少 ${side ? '2P' : '1P'} 段（&inote_${slot}）`);
  return parseSimaiChart(text, slot);
}
export function parseSimaiBuddyCharts(text: string): BuddyCharts { return { side1: parseSimaiSideChart(text, 0), side2: parseSimaiSideChart(text, 1) }; }

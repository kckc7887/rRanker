/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
import type {BaseNote, ButtonPosition, Note, SlideBranch, SlidePathType, SlideSegment, TouchPosition} from '../../types';
import {parseDuration} from './duration';
import {SimaiParseError} from './lexical';

const isButton = (s: string | undefined): s is string => s !== undefined && /^[1-8]$/.test(s);
const modifiers = 'hbmxfc!?@$';

class NoteReader {
  private cursor = 0;
  constructor(private readonly shouldYield: () => boolean, private readonly text: string, private readonly base: BaseNote) {}
  private fail(reason: string): never {throw new SimaiParseError(reason, this.base.source);}
  private digit(): ButtonPosition {
    const digit = this.text[this.cursor++];
    if (!isButton(digit)) this.fail('Invalid button position');
    return Number(digit) as ButtonPosition;
  }
  private* flags(): Generator<void, string, void> {
    const start = this.cursor;
    while (this.cursor < this.text.length && modifiers.includes(this.text[this.cursor]!)) {
      this.cursor++;
      if (((this.cursor - start) & 63) === 0 && this.shouldYield()) yield;
    }
    return this.text.slice(start, this.cursor);
  }
  private duration(slide: boolean): ReturnType<typeof parseDuration> | undefined {
    if (this.text[this.cursor] !== '[') return undefined;
    const end = this.text.indexOf(']', this.cursor + 1);
    if (end < 0) this.fail('Unclosed duration');
    const value = this.text.slice(this.cursor + 1, end);
    this.cursor = end + 1;
    return parseDuration(value, this.base.bpm, slide, this.base.source);
  }
  private* branch(start: ButtonPosition): Generator<void, SlideBranch, void> {
    const segments: SlideSegment[] = [];
    let position = start, isBreak = false, isMine = false, hasFan = false, durationMs = 0;
    yield* this.flags();
    const declarations: ReturnType<typeof parseDuration>[] = [];
    while (this.cursor < this.text.length && this.text[this.cursor] !== '*') {
      const begin = this.cursor;
      let type = this.text[this.cursor++]! as SlidePathType;
      let middle: ButtonPosition | undefined, end: ButtonPosition;
      if ((type === 'p' || type === 'q') && this.text[this.cursor] === type) {type = (type + type) as SlidePathType; this.cursor++;}
      if (type === 'V') {middle = this.digit(); end = this.digit();}
      else if ('ABCPQK'.includes(type)) {
        type = 'custom';
        this.cursor = begin;
        for (let iteration = 0; ; iteration++) {
          if ((iteration & 63) === 63 && this.shouldYield()) yield;
          const command = this.text[this.cursor++];
          if (!command || !'ABCPQK'.includes(command)) this.fail('Invalid custom path');
          if (command !== 'C') {
            if ((command === 'P' || command === 'Q') && this.text[this.cursor] === '0') this.cursor++;
            else end = this.digit();
            if (command === 'K') break;
          }
        }
      } else {
        if (!['-','>','<','^','v','p','pp','q','qq','s','z','w'].includes(type)) this.fail('Invalid Slide shape');
        end = this.digit();
      }
      const code = String(position) + this.text.slice(begin, this.cursor);
      const before = yield* this.flags();
      const duration = this.duration(true);
      const after = yield* this.flags();
      // A suffix next to a duration or at the branch end decorates the track.
      isBreak ||= (before + after).includes('b');
      isMine ||= (before + after).includes('m');
      segments.push({type, startPos: position, endPos: end!, ...(middle === undefined ? {} : {midPos: middle}),
        code, durationMs: duration?.durationMs ?? null, ...(duration ? {durationSpec: duration.spec} : {})});
      if (duration) { declarations.push(duration); durationMs += duration.durationMs; }
      if (type === 'w') hasFan = true;
      position = end!;
      if (this.shouldYield()) yield;
    }
    if (!segments.length || !declarations.length) this.fail('Slide requires a duration');
    const wholePath = declarations.length === 1 && segments.at(-1)!.durationMs !== null;
    if (!wholePath && declarations.length !== segments.length) this.fail('Invalid mixed Slide durations');
    if (segments.length > 1 && hasFan) this.fail('Fan Slide cannot be chained');
    const first = declarations[0]!;
    return {segments, durationMs,
      delayMs: first.delayMs ?? 60000 / this.base.bpm, isBreak, isMine, waitSpec: first.spec.wait,
      durationMode: declarations.length === segments.length ? 'per-segment' : 'whole-path'};
  }
  *read(): Generator<void, Note, void> {
    const first = this.text[this.cursor]!;
    let position: ButtonPosition | TouchPosition;
    const touch = /^[ABCDE]$/.test(first);
    if (touch) {
      this.cursor++;
      const digit = isButton(this.text[this.cursor]) ? this.digit() : undefined;
      if (first !== 'C' && digit === undefined) this.fail('Touch requires a position');
      position = first === 'C' ? 'C' : `${first}${digit}` as TouchPosition;
    } else position = this.digit();
    const prefix = yield* this.flags();
    const flagsAnywhere = this.text.split('*')[0]!.replace(/\[[^\]]*\]/g, '');
    const common = {...this.base, position, isBreak: prefix.includes('b'), isEx: flagsAnywhere.includes('x'),
      isMine: prefix.includes('m'), usingSV: !flagsAnywhere.includes('c'), isForceStar: flagsAnywhere.includes('$'), isFakeRotate: flagsAnywhere.includes('$$')};
    if (prefix.includes('h')) {
      const duration = this.duration(false) ?? parseDuration('1280:1', this.base.bpm, false, this.base.source);
      const suffix = yield* this.flags();
      if (this.cursor !== this.text.length) this.fail('Invalid HOLD suffix');
      const flags = prefix + suffix;
      const hold = {...common, isBreak: flags.includes('b'), isEx: flags.includes('x'), isMine: flags.includes('m'),
        endTimeMs: common.timingMs + duration.durationMs, durationMs: duration.durationMs,
        duration: duration.durationMs * this.base.bpm / 60000, durationSpec: duration.spec, isHoldStart: true as const};
      return touch ? {...hold, position: position as TouchPosition, type: 'touch-hold-start', hasFirework: flags.includes('f')}
        : {...hold, position: position as ButtonPosition, type: 'hold-start', isBreakHold: flags.includes('b')};
    }
    if (this.cursor < this.text.length) {
      if (touch) this.fail('Touch cannot start a Slide');
      const branches: SlideBranch[] = [];
      let endOffset = -Infinity;
      do {
        const branch = yield* this.branch(position as ButtonPosition);
        branches.push(branch);
        endOffset = Math.max(endOffset, branch.delayMs + branch.durationMs);
        if (this.cursor === this.text.length) break;
        this.cursor++;
        if (this.cursor === this.text.length) this.fail('Missing Slide branch');
      } while (true);
      return {...common, position: position as ButtonPosition, type: 'slide', branches,
        endTimeMs: common.timingMs + endOffset,
        isStartBreak: prefix.includes('b'), isHeadless: /[!?]/.test(flagsAnywhere),
        headlessMode: flagsAnywhere.includes('!') ? 'pop' : 'fade', isTapHead: flagsAnywhere.includes('@')};
    }
    return touch ? {...common, position: position as TouchPosition, type: 'touch', hasFirework: prefix.includes('f')}
      : {...common, position: position as ButtonPosition, type: common.isBreak ? 'break' : 'tap',
        isStar: prefix.includes('$'), isSpinningStar: prefix.includes('$$')};
  }
}

export function* readNote(shouldYield: () => boolean, text: string, base: BaseNote): Generator<void, Note[], void> {
  if (!/^[1-8]{2,}$/.test(text)) return [yield* new NoteReader(shouldYield, text, base).read()];
  const notes: Note[] = [];
  for (let i = 0; i < text.length; i++) {
    notes.push(yield* new NoteReader(shouldYield, text[i]!, base).read());
    if ((i & 63) === 63 && shouldYield()) yield;
  }
  return notes;
}

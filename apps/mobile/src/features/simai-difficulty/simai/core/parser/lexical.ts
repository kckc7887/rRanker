/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
import type {SourceLocation} from '../../types';

export class SimaiParseError extends Error {
  constructor(message: string, readonly source: SourceLocation) {
    super(`${message} (line ${source.line}, column ${source.column}: ${source.text})`);
    this.name = 'SimaiParseError';
  }
}
export class SourceMap {
  private readonly lines = [0];
  constructor(readonly text: string) {
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') this.lines.push(i + 1);
  }
  at(offset: number, text: string): SourceLocation {
    let lo = 0, hi = this.lines.length;
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (this.lines[mid]! > offset) hi = mid;
      else lo = mid;
    }
    return {offset, line: lo + 1, column: offset - this.lines[lo]! + 1, text};
  }
}
export function numberValue(text: string, source: SourceLocation, positive = false): number {
  const value = text.replace(/\s/g, '');
  const valid = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value);
  const n = Number(value);
  if (!valid || !Number.isFinite(n) || (positive ? n <= 0 : n < 0))
    throw new SimaiParseError(`Invalid number: ${text}`, source);
  return n;
}
export type Lexeme = {kind: 'notes' | 'comma' | 'bpm' | 'division' | 'speed' | 'signature'; value: string; offsets: number[]};

/** Whitespace and comments do not advance the notation clock. */
export function* scan(body: string, map: SourceMap, origin: number): Generator<Lexeme> {
  let value = '', offsets: number[] = [];
  const drain = (): Lexeme => {
    const token: Lexeme = {kind: 'notes', value, offsets};
    value = ''; offsets = [];
    return token;
  };
  for (let cursor = 0; cursor < body.length;) {
    const char = body[cursor]!;
    if (/\s/.test(char)) {cursor++; continue;}
    if (body.startsWith('||', cursor)) {
      const end = body.indexOf('\n', cursor);
      const stop = end < 0 ? body.length : end;
      const comment = body.slice(cursor + 2, stop).trim();
      if (/^s\d+\/\d+$/.test(comment))
        yield {kind: 'signature', value: comment.slice(1), offsets: [origin + cursor]};
      cursor = stop;
      continue;
    }
    if (char === ',') {
      if (value) yield drain();
      yield {kind: 'comma', value: ',', offsets: [origin + cursor++]};
      continue;
    }
    const close = char === '(' ? ')' : char === '{' ? '}' : body.startsWith('<HS*', cursor) || body.startsWith('<SV*', cursor) ? '>' : '';
    if (close) {
      const end = body.indexOf(close, cursor + 1);
      if (end < 0) throw new SimaiParseError(`Unclosed ${char}`, map.at(origin + cursor, body.slice(cursor)));
      const raw = body.slice(cursor, end + 1);
      yield {kind: char === '(' ? 'bpm' : char === '{' ? 'division' : 'speed', value: raw, offsets: [origin + cursor]};
      cursor = end + 1;
      continue;
    }
    if (char === 'E' && !value && (cursor + 1 === body.length || /[\s,]/.test(body[cursor + 1]!))) {cursor++; continue;}
    value += char;
    offsets.push(origin + cursor++);
  }
  if (value) yield drain();
}

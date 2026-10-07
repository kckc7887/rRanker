/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
import type {DurationSpec, DurationValue, SourceLocation} from '../../types';
import {numberValue, SimaiParseError} from './lexical';

/** Decode the two independent clocks: preparation and movement. */
export function parseDuration(raw: string, bpm: number, slide: boolean, source: SourceLocation):
  {durationMs: number; delayMs?: number; spec: DurationSpec} {
  let expression = raw.replace(/\s/g, '');
  if (expression.startsWith('[') && expression.endsWith(']')) expression = expression.slice(1, -1);
  let durationBpm = bpm;
  const spec: DurationSpec = {raw, declarationBpm: bpm, value: {mode: 'seconds', seconds: 0},
    wait: slide ? {mode: 'default-beat', beats: 1, bpm} : {mode: 'none'}, syntax: 'simai'};
  const explicitWait = expression.indexOf('##');
  if (explicitWait >= 0) {
    if (!slide) throw new SimaiParseError('Invalid HOLD wait', source);
    spec.wait = {mode: 'seconds', seconds: numberValue(expression.slice(0, explicitWait), source)};
    expression = expression.slice(explicitWait + 2);
  }
  const separator = expression.indexOf('#');
  if (separator >= 0) {
    const tempo = expression.slice(0, separator);
    expression = expression.slice(separator + 1);
    if (tempo) {
      durationBpm = numberValue(tempo, source, true);
      spec.explicitBpm = durationBpm;
      if (slide && explicitWait < 0) spec.wait = {mode: 'default-beat', beats: 1, bpm: durationBpm};
    } else if (slide && explicitWait < 0) spec.syntax = 'lxns-seconds-extension';
  }
  let value: DurationValue;
  if (expression.includes(':')) {
    const parts = expression.split(':');
    if (parts.length !== 2) throw new SimaiParseError('Invalid duration ratio', source);
    const divisor = numberValue(parts[0]!, source, true), count = numberValue(parts[1]!, source);
    value = {mode: 'ratio', divisor, count, beats: 4 / divisor * count};
  } else {
    if (separator < 0 && explicitWait < 0) throw new SimaiParseError('Invalid duration', source);
    value = {mode: 'seconds', seconds: numberValue(expression, source)};
  }
  spec.value = value;
  const durationMs = value.mode === 'seconds' ? value.seconds * 1000 : 240000 / durationBpm / value.divisor * value.count;
  const delayMs = spec.wait.mode === 'seconds' ? spec.wait.seconds * 1000
    : spec.wait.mode === 'default-beat' ? 60000 / spec.wait.bpm : undefined;
  return {durationMs, ...(slide && (explicitWait >= 0 || spec.explicitBpm !== undefined) ? {delayMs} : {}), spec};
}

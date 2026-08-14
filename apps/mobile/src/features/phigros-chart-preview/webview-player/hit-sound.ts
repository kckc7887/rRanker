/**
 * 打击音时间轴移植自 demo/phigros-chart-preview/hit-sound.js。
 * Tap 与 Hold 头部使用 click，Drag/Flick 使用同名音效；Hold 持续期间不重复触发。
 */

export type HitSoundKind = 'click' | 'drag' | 'flick';

const SOUND_BY_NOTE_KIND: Readonly<Record<string, HitSoundKind>> = Object.freeze({
  tap: 'click',
  hold: 'click',
  drag: 'drag',
  flick: 'flick',
});

export const HIT_SOUND_LOOKAHEAD_SECONDS = 0.12;

export interface HitSoundEvent {
  time: number;
  sound: HitSoundKind;
  noteKind: string;
  lineIndex: number;
}

export function hitSoundScheduleDelay(eventTime: number, chartTime: number, playbackRate: number): number {
  if (!Number.isFinite(eventTime) || !Number.isFinite(chartTime)) throw new TypeError('打击音时间必须是有限数值');
  if (!Number.isFinite(playbackRate) || playbackRate <= 0) throw new RangeError('播放倍速必须大于 0');
  return Math.max(0, (eventTime - chartTime) / playbackRate);
}

export function buildHitSoundEvents(chart: { lines: { notes: { kind: string; time: number }[] }[] }): HitSoundEvent[] {
  const events: HitSoundEvent[] = [];
  chart.lines.forEach((line, lineIndex) => {
    line.notes.forEach((note) => {
      const sound = SOUND_BY_NOTE_KIND[note.kind];
      if (!sound) return;
      events.push({ time: note.time, sound, noteKind: note.kind, lineIndex });
    });
  });
  events.sort((a, b) => a.time - b.time || a.lineIndex - b.lineIndex);
  return events;
}

export function findHitSoundCursor(events: readonly HitSoundEvent[], time: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (events[middle]!.time <= time) low = middle + 1;
    else high = middle;
  }
  return low;
}

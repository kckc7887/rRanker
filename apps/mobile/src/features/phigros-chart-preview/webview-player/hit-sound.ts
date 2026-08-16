/**
 * 打击音时间轴移植自 demo/phigros-chart-preview/hit-sound.js。
 * Tap 与 Hold 头部使用 click，Drag/Flick 使用同名音效；Hold 持续期间不重复触发。
 *
 * 许可证：打击音分配语义衍生自 TeamFlos/phira（GPL-3.0，https://github.com/TeamFlos/phira），
 * 相应部分按 GPL-3.0 随本项目（AGPL-3.0）一并发布，两者兼容；来源与许可证全文见仓库根 THIRD_PARTY_NOTICES.md。
 */

export type HitSoundKind = 'click' | 'drag' | 'flick';

const SOUND_BY_NOTE_KIND: Readonly<Record<string, HitSoundKind>> = Object.freeze({
  tap: 'click',
  hold: 'click',
  drag: 'drag',
  flick: 'flick',
});

/** 与舞萌谱面确认一致的前瞻窗口：提前 1.5 秒调度，掉帧时仍有裕量。 */
export const HIT_SOUND_LOOKAHEAD_SECONDS = 1.5;

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

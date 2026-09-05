/** MajdataViewX TimeProvider.LoadSV: continuous piecewise-linear visual time. GPL-3.0. */
import type { ScrollEvent } from '../../types';
export class ScrollTimeline {
  private points: { timeMs: number; velocity: number; position: number }[] = [];
  constructor(events: readonly ScrollEvent[]) {
    let time = 0, position = 0, velocity = 1;
    for (const event of [...events].sort((a, b) => a.timeMs - b.timeMs)) {
      position += (event.timeMs - time) * velocity;
      this.points.push({ ...event, position }); time = event.timeMs; velocity = event.velocity;
    }
  }
  at(timeMs: number): number {
    let lo = 0, hi = this.points.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.points[mid].timeMs <= timeMs) lo = mid + 1; else hi = mid; }
    const point = this.points[lo - 1];
    return point ? point.position + (timeMs - point.timeMs) * point.velocity : timeMs;
  }
}

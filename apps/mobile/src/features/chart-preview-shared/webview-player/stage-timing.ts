let current: number | null = null;

/** 仅连续播放的 RAF 参与效果分辨率调整。 */
export function withStageFrame(timestamp: number, draw: () => void): void {
  const previous = current;
  current = timestamp;
  try {
    draw();
  } finally {
    current = previous;
  }
}

export class StageTiming {
  scale = 1;
  get continuous(): boolean {
    return current !== null;
  }
  private previous: number | null = null;
  private interval = 1000 / 60;
  private candidate = 0;
  private samples = 0;
  private overload = 0;
  private steady = 0;

  sample(): void {
    const previous = this.previous;
    this.previous = current;
    if (current === null || previous === null || current - previous > 160) {
      this.overload = this.steady = this.samples = 0;
      return;
    }
    const elapsed = current - previous;
    if (elapsed < 5) return;
    const measured = elapsed <= 9.5 ? 1000 / 120 : elapsed <= 12.5 ? 1000 / 90 : 1000 / 60;
    if (measured < this.interval) {
      this.samples = measured === this.candidate ? this.samples + 1 : 1;
      this.candidate = measured;
      if (this.samples >= 4) this.interval = measured;
    } else this.samples = 0;
    const late = elapsed > this.interval * 1.35;
    this.overload = Math.max(0, this.overload + (late ? elapsed : -elapsed));
    this.steady = elapsed <= this.interval * 1.15 ? this.steady + elapsed : 0;
    if (this.overload < 700 && this.steady < 4000) return;
    this.scale = Math.max(0.5, Math.min(1, this.scale + (this.overload >= 700 ? -0.25 : 0.25)));
    this.overload = this.steady = 0;
  }
}

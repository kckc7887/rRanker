/**
 * 舞萌谱面确认时间线视图。
 * 窗口控制器与横屏全屏控制器各持有一个实例，各自拥有密度条、刻度与播放头节点；
 * 位置换算仍来自播放会话的同一时间轴。
 */

/** 密度条的类别顺序与颜色与既有控制器保持一致。 */
export const SIMAI_TIMELINE_KINDS = ['tap', 'hold', 'slide', 'touch', 'break'] as const;

export type SimaiTimelineNoteKind = typeof SIMAI_TIMELINE_KINDS[number];

export const SIMAI_TIMELINE_COLORS: Readonly<Record<SimaiTimelineNoteKind, string>> = Object.freeze({
  tap: '#FFD700',
  hold: '#FF8C00',
  slide: '#00CED1',
  touch: '#0080FF',
  break: '#ff69b4',
});

const TIMELINE_BAR_HEIGHT = 22;
const TIMELINE_BUCKET_LIMIT = 200;

export interface SimaiTimelineEntry {
  timeMs: number;
  kind: SimaiTimelineNoteKind;
}

export interface SimaiTimelineViewOptions {
  /** 宽度基准与拖动宿主。 */
  host: HTMLElement;
  bars: HTMLElement;
  ruler: HTMLElement;
  playhead: HTMLElement;
  badge: HTMLElement;
  /** 窗口控制器为 `timeline`，全屏控制器为 `fs-timeline`。 */
  classPrefix: 'timeline' | 'fs-timeline';
  durationMs: number;
  maxMeasure: number;
  /** 每个小节起点在总时长中的百分比。 */
  measurePercents: readonly number[];
  entries: readonly SimaiTimelineEntry[];
}

export class SimaiTimelineView {
  constructor(private readonly options: SimaiTimelineViewOptions) {}

  build(): void {
    const { bars, durationMs } = this.options;
    bars.replaceChildren();
    if (durationMs <= 0) return;
    const width = Math.max(1, Math.ceil(this.options.host.getBoundingClientRect().width));
    const bucketCount = Math.min(TIMELINE_BUCKET_LIMIT, width);
    const step = durationMs / bucketCount;
    const totals = new Array<number>(bucketCount).fill(0);
    const counts = Array.from(
      { length: bucketCount },
      () => ({ tap: 0, hold: 0, slide: 0, touch: 0, break: 0 }) as Record<SimaiTimelineNoteKind, number>,
    );
    for (const entry of this.options.entries) {
      const index = Math.min(bucketCount - 1, Math.max(0, Math.floor(entry.timeMs / step)));
      counts[index]![entry.kind] += 1;
      totals[index]! += 1;
    }
    let maxTotal = 1;
    for (const total of totals) {
      if (total > maxTotal) maxTotal = total;
    }
    for (let index = 0; index < bucketCount; index++) {
      const total = totals[index]!;
      if (total === 0) continue;
      const bar = document.createElement('div');
      bar.className = `${this.options.classPrefix}-bar`;
      bar.style.left = `${((index * step / durationMs) * 100).toFixed(2)}%`;
      bar.style.width = `${((step / durationMs) * 100).toFixed(2)}%`;
      bar.style.height = `${Math.max(2, (total / maxTotal) * TIMELINE_BAR_HEIGHT)}px`;
      for (const kind of SIMAI_TIMELINE_KINDS) {
        const count = counts[index]![kind];
        if (count === 0) continue;
        const segment = document.createElement('div');
        segment.style.flex = String(count / total);
        segment.style.width = '100%';
        segment.style.backgroundColor = SIMAI_TIMELINE_COLORS[kind];
        bar.appendChild(segment);
      }
      bars.appendChild(bar);
    }
    this.buildRuler();
  }

  updatePlayhead(percent: number, measure: number): void {
    this.options.playhead.style.left = `${percent}%`;
    this.options.badge.style.left = `${percent}%`;
    this.options.badge.textContent = String(measure);
  }

  private buildRuler(): void {
    const { ruler, measurePercents, maxMeasure } = this.options;
    ruler.replaceChildren();
    const width = Math.max(1, ruler.getBoundingClientRect().width);
    const tickStep = [1, 5, 10, 50, 100]
      .find((step) => maxMeasure > 0 && (width * step) / maxMeasure >= 4) ?? 100;
    const labelStep = [5, 10, 20, 50, 100, 200]
      .find((step) => maxMeasure > 0 && (width * step) / maxMeasure >= 24) ?? 200;
    for (let measure = 0; measure <= maxMeasure; measure++) {
      const percent = measurePercents[measure] ?? 0;
      if (measure % tickStep === 0) {
        const tick = document.createElement('div');
        tick.className = `${this.options.classPrefix}-tick ${
          measure % 10 === 0 ? 'major' : measure % 5 === 0 ? 'medium' : 'minor'}`;
        tick.style.left = `${percent}%`;
        ruler.appendChild(tick);
      }
      if (measure % labelStep === 0) {
        const label = document.createElement('div');
        label.className = `${this.options.classPrefix}-label`;
        label.style.left = `${percent}%`;
        label.textContent = String(measure);
        ruler.appendChild(label);
      }
    }
  }
}

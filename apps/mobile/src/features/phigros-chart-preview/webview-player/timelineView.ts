/**
 * Phigros / Phira 谱面确认时间线视图。
 * 拥有密度条、刻度与播放头节点；时长与音符条目每次构建时由宿主传入，视图不保存副本。
 */

const NOTE_BAR_COLORS: Readonly<Record<string, string>> = Object.freeze({
  tap: '#FFD700',
  drag: '#00CED1',
  hold: '#FF8C00',
  flick: '#ff69b4',
});

const NOTE_BAR_KINDS = ['tap', 'drag', 'hold', 'flick'] as const;
const TIMELINE_BAR_HEIGHT = 22;
const TIMELINE_BUCKET_LIMIT = 200;

export interface PhigrosTimelineEntry {
  time: number;
  kind: string;
}

export interface PhigrosTimelineViewOptions {
  host: HTMLElement;
  bars: HTMLElement;
  ruler: HTMLElement;
  playhead: HTMLElement;
  badge: HTMLElement;
  /** 刻度与播放头标签沿用播放器的时间格式。 */
  formatTime(seconds: number): string;
}

export class PhigrosTimelineView {
  constructor(private readonly options: PhigrosTimelineViewOptions) {}

  build(durationSeconds: number, entries: readonly PhigrosTimelineEntry[]): void {
    const { bars } = this.options;
    bars.replaceChildren();
    if (durationSeconds <= 0) return;
    const width = Math.max(1, Math.ceil(this.options.host.getBoundingClientRect().width));
    const bucketCount = Math.min(TIMELINE_BUCKET_LIMIT, width);
    const step = durationSeconds / bucketCount;
    const buckets: Record<string, number>[] = Array.from({ length: bucketCount }, (_, i) => ({
      startTime: i * step, tap: 0, drag: 0, hold: 0, flick: 0, total: 0,
    }));
    for (const entry of entries) {
      const index = Math.min(bucketCount - 1, Math.max(0, Math.floor(entry.time / step)));
      const bucket = buckets[index]!;
      if (entry.kind === 'drag') bucket.drag += 1;
      else if (entry.kind === 'hold') bucket.hold += 1;
      else if (entry.kind === 'flick') bucket.flick += 1;
      else bucket.tap += 1;
      bucket.total += 1;
    }
    let maxTotal = 1;
    for (const bucket of buckets) {
      if (bucket.total > maxTotal) maxTotal = bucket.total;
    }
    for (const bucket of buckets) {
      if (bucket.total === 0) continue;
      const bar = document.createElement('div');
      bar.className = 'timeline-bar';
      bar.style.left = `${((bucket.startTime / durationSeconds) * 100).toFixed(2)}%`;
      bar.style.width = `${((step / durationSeconds) * 100).toFixed(2)}%`;
      bar.style.height = `${Math.max(2, (bucket.total / maxTotal) * TIMELINE_BAR_HEIGHT)}px`;
      for (const kind of NOTE_BAR_KINDS) {
        const ratio = bucket[kind]! / bucket.total;
        if (ratio === 0) continue;
        const segment = document.createElement('div');
        segment.style.flex = String(ratio);
        segment.style.width = '100%';
        segment.style.backgroundColor = NOTE_BAR_COLORS[kind]!;
        bar.appendChild(segment);
      }
      bars.appendChild(bar);
    }
    this.buildRuler(durationSeconds);
  }

  updatePlayhead(chartTime: number, durationSeconds: number): void {
    if (durationSeconds <= 0) return;
    const pct = Math.min(100, Math.max(0, (chartTime / durationSeconds) * 100));
    this.options.playhead.style.left = `${pct}%`;
    this.options.badge.style.left = `${pct}%`;
    this.options.badge.textContent = this.options.formatTime(chartTime);
  }

  private buildRuler(durationSeconds: number): void {
    const { ruler } = this.options;
    ruler.replaceChildren();
    const width = Math.max(1, ruler.getBoundingClientRect().width);
    const total = Math.max(1, durationSeconds);
    const tickStep = [1, 5, 10, 15, 30, 60, 120, 300].find((step) => (width * step) / total >= 4) ?? 300;
    const labelStep = [5, 10, 15, 30, 60, 120, 300, 600].find((step) => (width * step) / total >= 24) ?? 600;
    for (let t = 0; t <= durationSeconds; t += tickStep) {
      const pct = ((t / total) * 100).toFixed(2);
      const isMajor = t % labelStep === 0;
      const isMedium = Number.isInteger(t / (labelStep / 2));
      const tick = document.createElement('div');
      tick.className = `timeline-tick ${isMajor ? 'major' : isMedium ? 'medium' : 'minor'}`;
      tick.style.left = `${pct}%`;
      ruler.appendChild(tick);
      if (isMajor) {
        const label = document.createElement('div');
        label.className = 'timeline-label';
        label.style.left = `${pct}%`;
        label.textContent = this.options.formatTime(t);
        ruler.appendChild(label);
      }
    }
  }
}

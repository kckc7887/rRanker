import { HeatTimelineView, type HeatTimelineElements } from '../../chart-preview-shared/webview-player/heat-timeline';

export interface SimaiTimelineEntry { timeMs: number; side: number }
export interface SimaiTimelineViewOptions extends HeatTimelineElements {
  durationMs: number;
  maxMeasure: number;
  measurePercents: readonly number[];
  entries: readonly SimaiTimelineEntry[];
  trackCount: number;
}

export class SimaiTimelineView {
  private readonly heat: HeatTimelineView;
  constructor(private readonly options: SimaiTimelineViewOptions) {
    this.heat = new HeatTimelineView(options);
  }

  build(): void {
    const { durationMs, entries, trackCount, measurePercents } = this.options;
    const tracks = Array.from({ length: trackCount }, (_, side) => ({
      ...(trackCount > 1 ? { label: `${side + 1}P` } : {}),
      times: entries.filter(entry => entry.side === side).map(entry => entry.timeMs),
    }));
    this.heat.build(durationMs, tracks, measurePercents.map((percent, index) => ({ percent, text: String(index) })));
  }

  updatePlayhead(percent: number, measure: number): void {
    this.heat.updateProgress(percent, String(measure));
  }

  updateLoop(a: number | null, b: number | null): void { this.heat.updateLoop(a, b); }
}

import { HeatTimelineView, heatTimeLabels, type HeatTimelineElements } from '../../chart-preview-shared/webview-player/heat-timeline';

export interface PhigrosTimelineEntry { time: number; kind: string }
export interface PhigrosTimelineViewOptions extends HeatTimelineElements {
  formatTime(seconds: number): string;
}

export class PhigrosTimelineView {
  private readonly heat: HeatTimelineView;
  private entries: readonly PhigrosTimelineEntry[] | undefined;
  private times: number[] = [];
  constructor(private readonly options: PhigrosTimelineViewOptions) {
    this.heat = new HeatTimelineView(options);
  }

  build(durationSeconds: number, entries: readonly PhigrosTimelineEntry[]): void {
    if (this.entries !== entries) {
      this.entries = entries;
      this.times = entries.map(entry => entry.time);
    }
    this.heat.build(durationSeconds, [{ times: this.times }],
      heatTimeLabels(durationSeconds, this.options.formatTime));
  }

  updateLoop(a: number | null, b: number | null): void {
    this.heat.updateLoop(a, b);
  }

  updatePlayhead(chartTime: number, durationSeconds: number): void {
    this.heat.updateProgress(durationSeconds > 0 ? chartTime / durationSeconds * 100 : 0, this.options.formatTime(chartTime));
  }
}

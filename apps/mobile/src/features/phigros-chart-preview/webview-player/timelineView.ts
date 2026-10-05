import { HeatTimelineView, heatTimeLabels, type HeatTimelineElements } from '../../chart-preview-shared/webview-player/heat-timeline';

export interface PhigrosTimelineEntry { time: number; kind: string }
export interface PhigrosTimelineViewOptions extends HeatTimelineElements {
  formatTime(seconds: number): string;
}

export class PhigrosTimelineView {
  private readonly heat: HeatTimelineView;
  constructor(private readonly options: PhigrosTimelineViewOptions) {
    this.heat = new HeatTimelineView(options);
  }

  build(durationSeconds: number, entries: readonly PhigrosTimelineEntry[]): void {
    this.heat.build(durationSeconds, [{ times: entries.map(entry => entry.time) }],
      heatTimeLabels(durationSeconds, this.options.formatTime));
  }

  updateLoop(a: number | null, b: number | null): void {
    this.heat.updateLoop(a, b);
  }

  updatePlayhead(chartTime: number, durationSeconds: number): void {
    this.heat.updateProgress(durationSeconds > 0 ? chartTime / durationSeconds * 100 : 0, this.options.formatTime(chartTime));
  }
}

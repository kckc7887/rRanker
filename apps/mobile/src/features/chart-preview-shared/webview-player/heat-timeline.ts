import { PlayerEventScope } from './event-scope';

export interface HeatTimelineTrack {
  label?: string;
  times: readonly number[];
}

export function buildHeatDensity(duration: number, tracks: readonly HeatTimelineTrack[], width: number): number[][] {
  if (!Number.isFinite(duration) || duration <= 0) return tracks.map(() => []);
  const count = Math.min(200, Math.max(1, Math.ceil(Number.isFinite(width) ? width : 1)));
  const counts = tracks.map(track => {
    const bins = new Array<number>(count).fill(0);
    for (const time of track.times) {
      if (Number.isFinite(time)) bins[Math.min(count - 1, Math.max(0, Math.floor(time / duration * count)))]! += 1;
    }
    return bins;
  });
  // 多轨共用最大值，空段保持空白；非空段最小不透明度为 2/22。
  const maximum = Math.max(1, ...counts.flat());
  return counts.map(bins => bins.map(count => count === 0 ? 0 : Math.max(2 / 22, count / maximum)));
}

export interface HeatTimelineElements {
  host: HTMLElement;
  bars: HTMLElement;
  ruler: HTMLElement;
  playhead: HTMLElement;
  badge: HTMLElement;
}

export class HeatTimelineView {
  private loop: readonly [number | null, number | null] = [null, null];
  private markers: { a: HTMLElement; b: HTMLElement; range: HTMLElement }[] = [];

  constructor(private readonly elements: HeatTimelineElements) {
    elements.host.classList.add('heat-timeline');
    elements.bars.classList.add('heat-bars');
    elements.ruler.classList.add('heat-ruler');
    elements.host.setAttribute('role', 'slider');
    elements.host.setAttribute('aria-label', '播放进度');
    elements.host.setAttribute('aria-valuemin', '0');
    elements.host.setAttribute('aria-valuemax', '100');
    elements.host.tabIndex = 0;
    elements.bars.setAttribute('aria-hidden', 'true');
    elements.ruler.setAttribute('aria-hidden', 'true');
  }

  build(duration: number, tracks: readonly HeatTimelineTrack[], labels: readonly { percent: number; text: string }[]): void {
    const { host, bars, ruler } = this.elements;
    const densities = buildHeatDensity(duration, tracks, host.getBoundingClientRect().width);
    host.dataset.tracks = String(tracks.length);
    this.markers = [];
    bars.replaceChildren();
    tracks.forEach((track, index) => {
      const row = document.createElement('div');
      row.className = 'heat-track';
      if (track.label) {
        const label = document.createElement('span');
        label.className = 'heat-track-label';
        label.textContent = track.label;
        row.append(label);
      }
      const strip = document.createElement('div');
      strip.className = 'heat-strip';
      const range = document.createElement('span');
      range.className = 'heat-loop-range';
      strip.append(range);
      for (const played of [false, true]) {
        const layer = document.createElement('div');
        layer.className = played ? 'heat-layer played' : 'heat-layer';
        const bins = densities[index]!;
        bins.forEach((density, bin) => {
          if (density === 0) return;
          const segment = document.createElement('span');
          segment.className = 'heat-bin';
          segment.style.left = `${bin / bins.length * 100}%`;
          segment.style.width = `${100 / bins.length}%`;
          segment.style.opacity = String(density);
          layer.append(segment);
        });
        strip.append(layer);
      }
      const cursor = document.createElement('span');
      cursor.className = 'heat-cursor';
      strip.append(cursor);
      const [a, b] = ['A', 'B'].map(text => {
        const marker = document.createElement('span');
        marker.className = 'heat-loop-marker';
        marker.textContent = text;
        strip.append(marker);
        return marker;
      });
      this.markers.push({ a: a!, b: b!, range });
      row.append(strip);
      bars.append(row);
    });
    ruler.replaceChildren();
    const width = Math.max(1, host.getBoundingClientRect().width);
    let last = -Infinity;
    for (const { percent, text } of labels) {
      const x = percent * width / 100;
      if (percent < 0 || percent > 100 || x - last < 44 || (percent > 0 && width - x < 20)) continue;
      last = x;
      const label = document.createElement('span');
      label.className = 'heat-label';
      label.style.left = `${percent}%`;
      label.textContent = text;
      ruler.append(label);
    }
    this.updateLoop(...this.loop);
  }

  updateProgress(percent: number, text: string): void {
    const value = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0));
    const { host, playhead, badge } = this.elements;
    host.style.setProperty('--heat-progress', `${value}%`);
    host.setAttribute('aria-valuenow', String(value));
    host.setAttribute('aria-valuetext', text);
    playhead.style.left = `${value}%`;
    badge.textContent = text;
  }

  updateLoop(a: number | null, b: number | null): void {
    this.loop = [a, b];
    for (const nodes of this.markers) {
      for (const [marker, position] of [[nodes.a, a], [nodes.b, b]] as const) {
        marker.hidden = position === null;
        if (position !== null) marker.style.left = `${position}%`;
      }
      nodes.range.hidden = a === null || b === null;
      if (a !== null && b !== null) {
        nodes.range.style.left = `${Math.min(a, b)}%`;
        nodes.range.style.width = `${Math.abs(b - a)}%`;
      }
    }
  }
}

export function heatTimeLabels(duration: number, format: (time: number) => string): { percent: number; text: string }[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  return Array.from({ length: 6 }, (_, index) => ({ percent: index * 20, text: format(duration * index / 5) }));
}

export function bindHeatTimelineKeyboard(
  events: PlayerEventScope,
  host: HTMLElement,
  readPercent: () => number,
  seek: (percent: number) => void,
): void {
  events.listen(host, 'keydown', event => {
    const key = event.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 5 : 1;
    const value = key === 'Home' ? 0 : key === 'End' ? 100
      : readPercent() + (key === 'ArrowRight' || key === 'ArrowUp' ? step : -step);
    seek(Math.max(0, Math.min(100, value)));
  });
}

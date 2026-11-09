import { lowerBoundBy, upperBoundBy } from '../../chart-preview-shared/webview-player/sorted-search';

const LOOKAHEAD = 0.12;

export function createHitBuffer(context: AudioContext, frequency: number): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * 0.045));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / context.sampleRate;
    data[i] = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 48);
  }
  return buffer;
}

export class HitSoundScheduler {
  private cursor = 0;
  private readonly active = new Map<AudioBufferSourceNode, number>();

  constructor(
    private readonly context: AudioContext,
    private readonly tap: AudioBuffer,
    private readonly drag: AudioBuffer,
    private readonly events: readonly { seconds: number; type: number }[],
    private readonly gain: GainNode,
  ) {}

  reset(chartSeconds: number, includeRecent = true): void {
    this.stop();
    this.cursor = includeRecent
      ? lowerBoundBy(this.events, chartSeconds - .02, event => event.seconds)
      : upperBoundBy(this.events, chartSeconds, event => event.seconds);
  }

  rewind(chartSeconds: number, when: number): void {
    for (const [source, stop] of this.active) {
      if (stop <= when) continue;
      source.stop(when);
      this.active.set(source, when);
    }
    this.cursor = lowerBoundBy(this.events, chartSeconds - 1e-7, event => event.seconds);
  }

  stop(): void {
    for (const source of this.active.keys()) {
      try { source.stop(); } catch {}
    }
    this.active.clear();
  }

  schedule(chartSeconds: number, outputTime: number, enabled: boolean, playbackSpeed = 1, end = Infinity): void {
    if (!enabled) return;
    const speed = Math.max(0.001, playbackSpeed);
    const until = chartSeconds + LOOKAHEAD * speed;
    while (this.cursor < this.events.length && this.events[this.cursor]!.seconds <= until) {
      const event = this.events[this.cursor]!;
      if (event.seconds >= end) break;
      this.cursor += 1;
      const delay = (event.seconds - chartSeconds) / speed;
      if (delay < -0.02) continue;
      const source = this.context.createBufferSource();
      source.buffer = event.type === 1 ? this.drag : this.tap;
      source.connect(this.gain);
      const startAt = Math.max(this.context.currentTime, outputTime + delay);
      source.start(startAt);
      this.active.set(source, Infinity);
      source.onended = () => this.active.delete(source);
    }
  }
}

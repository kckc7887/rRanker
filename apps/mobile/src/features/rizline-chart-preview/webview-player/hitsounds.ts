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
  private readonly active = new Set<AudioBufferSourceNode>();

  constructor(
    private readonly context: AudioContext,
    private readonly tap: AudioBuffer,
    private readonly drag: AudioBuffer,
    private readonly events: readonly { seconds: number; type: number }[],
    private readonly gain: GainNode,
  ) {}

  reset(chartSeconds: number): void {
    this.stop();
    this.cursor = 0;
    while (this.cursor < this.events.length && this.events[this.cursor]!.seconds < chartSeconds - 0.02) {
      this.cursor += 1;
    }
  }

  stop(): void {
    for (const source of this.active) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.active.clear();
  }

  schedule(chartSeconds: number, outputTime: number, enabled: boolean, playbackSpeed = 1): void {
    if (!enabled) return;
    const speed = Math.max(0.001, playbackSpeed);
    const until = chartSeconds + LOOKAHEAD * speed;
    while (this.cursor < this.events.length && this.events[this.cursor]!.seconds <= until) {
      const event = this.events[this.cursor]!;
      this.cursor += 1;
      const delay = (event.seconds - chartSeconds) / speed;
      if (delay < -0.02) continue;
      const source = this.context.createBufferSource();
      source.buffer = event.type === 1 ? this.drag : this.tap;
      source.connect(this.gain);
      const startAt = Math.max(this.context.currentTime, outputTime + delay);
      source.start(startAt);
      this.active.add(source);
      source.onended = () => this.active.delete(source);
    }
  }
}

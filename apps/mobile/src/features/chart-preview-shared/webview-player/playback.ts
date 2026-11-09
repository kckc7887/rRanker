import { withStageFrame } from './stage-timing';
import { getAudioContextOutputTime } from './audioClock';
import { PlaybackClock, audioContextTime, musicPosition, outputTime, type ClockLoop } from './playbackClock';
import { PlaybackLoop } from './playback-loop';

type SoundReset = 'start' | 'speed' | 'stop';
export interface PlaybackAdapter {
  duration(): number;
  prepare(): Promise<void> | void;
  context(): AudioContext;
  music(): AudioBuffer | null;
  output(): AudioNode;
  musicOffset(): number;
  resetSounds(seconds: number, reason: SoundReset): void;
  rewindSounds(seconds: number, when: number): void;
  schedule(seconds: number, contextTime: number, speed: number, end: number): void;
  lead?: number;
  silentFrameClock?: boolean;
  onState?(playing: boolean): void;
  onError?(error: unknown): void;
}

/** 位置、循环端点和音效窗口均以从预览起点算起的秒表示。 */
export class PreviewPlayback {
  readonly loop = new PlaybackLoop(() => this.changeLoop());
  private readonly clock = new PlaybackClock();
  private position = 0;
  private anchor = 0;
  private silent = false;
  private range: ClockLoop | null = null;
  private soundLap = 0;
  private soundStart = 0;
  private visibleLap = 0;
  private generation = 0;
  private frame: number | null = null;
  private source: AudioBufferSourceNode | null = null;
  private readonly sources = new Map<AudioBufferSourceNode, GainNode | null>();
  private nextMusicAt = Infinity;
  private shortLoop: AudioBuffer | null = null;
  private songStart = 0;
  playing = false;
  ended = false;
  disposed = false;
  speed = 1;
  onFrame?: (seconds: number, discontinuity: boolean) => void;

  constructor(private readonly adapter: PlaybackAdapter) {}

  get loopEnd(): number {
    return this.range?.b ?? Infinity;
  }

  get currentTime(): number {
    if (!this.playing) return this.position;
    const heard = this.outputClockTime();
    this.clock.prune(heard);
    return this.clamp(this.clock.positionAt(heard));
  }

  get scheduledTime(): number {
    return this.playing ? this.clock.positionAt(this.schedulingClockTime()) : this.position;
  }

  private schedulingClockTime() {
    return audioContextTime(this.silent ? performance.now() / 1000 : Math.max(this.anchor, this.adapter.context().currentTime));
  }

  private outputClockTime() {
    return outputTime(this.silent ? performance.now() / 1000 : getAudioContextOutputTime(this.adapter.context()));
  }

  moveTo(seconds: number): void {
    if (!this.playing) this.generation++;
    this.position = this.clamp(seconds);
    this.ended = this.position >= this.adapter.duration();
  }

  async playFrom(seconds: number): Promise<void> {
    if (this.disposed) return;
    const target = this.loop.target(seconds) ?? (seconds >= this.adapter.duration() ? 0 : this.clamp(seconds));
    this.stop();
    this.position = target;
    const generation = this.generation;
    try {
      const ready = this.adapter.prepare();
      if (ready) await ready;
      if (generation !== this.generation) return;
      this.start(target);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      if (!this.adapter.onError) throw error;
      this.adapter.onError(error);
    }
  }

  private start(seconds: number): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    const context = this.adapter.context();
    const music = this.adapter.music();
    this.silent = !music && !!this.adapter.silentFrameClock;
    this.anchor = this.silent ? performance.now() / 1000 : context.currentTime + (music ? this.adapter.lead ?? 0 : 0);
    this.clock.set(audioContextTime(this.anchor), musicPosition(seconds), this.speed, this.range);
    this.visibleLap = this.soundLap = 0;
    this.soundStart = this.anchor;
    this.position = seconds;
    this.playing = true;
    this.ended = false;
    this.planMusic(seconds, this.anchor, true);
    this.adapter.resetSounds(seconds, 'start');
    this.scheduleSounds();
    this.adapter.onState?.(true);
    this.onFrame?.(seconds, true);
    this.startFrames();
  }

  private planMusic(seconds: number, when: number, fadeIn = false): void {
    const buffer = this.adapter.music();
    if (!buffer) return;
    const offset = this.adapter.musicOffset();
    const loop = this.range;
    const start = when + Math.max(0, -(seconds + offset)) / this.speed;
    if (!loop || (loop.a + offset >= 0 && loop.b + offset <= buffer.duration)) {
      if (seconds + offset >= buffer.duration) return;
      const songLoop = loop ? { a: loop.a + offset, b: loop.b + offset } : null;
      this.source = this.playBuffer(buffer, start, Math.max(0, seconds + offset), songLoop, undefined, fadeIn);
      this.songStart = start;
      return;
    }

    const period = loop.b - loop.a;
    const overlapStart = Math.max(0, loop.a + offset);
    const overlapEnd = Math.min(buffer.duration, loop.b + offset);
    const hasAudio = overlapStart < overlapEnd;
    /* 极短循环跨过音轨头尾时以一段补零样本循环，避免每帧创建大量音源。 */
    if (hasAudio && period <= .5) {
      const rate = buffer.sampleRate;
      const length = Math.max(1, Math.ceil(period * rate));
      if (!this.shortLoop) {
        this.shortLoop = this.adapter.context().createBuffer(buffer.numberOfChannels, length, rate);
        const from = Math.round(overlapStart * rate);
        const to = Math.round(overlapEnd * rate);
        const at = Math.min(length, Math.round((overlapStart - loop.a - offset) * rate));
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const samples = buffer.getChannelData(channel).subarray(from, Math.min(to, from + length - at));
          this.shortLoop.getChannelData(channel).set(samples, at);
        }
      }
      if (seconds < loop.a) this.playMusicSlice(buffer, seconds, loop.a, when, fadeIn);
      const loopAt = when + Math.max(0, loop.a - seconds) / this.speed;
      this.playBuffer(this.shortLoop, loopAt, Math.max(0, seconds - loop.a), { a: 0, b: period });
      return;
    }
    this.playMusicSlice(buffer, seconds, loop.b, when, fadeIn);
    if (hasAudio) {
      this.nextMusicAt = when + (loop.b - seconds) / this.speed;
      this.playMusicSlice(buffer, loop.a, loop.b, this.nextMusicAt);
      this.nextMusicAt += period / this.speed;
      this.queueMusic(when);
    }
  }

  private playMusicSlice(buffer: AudioBuffer, from: number, to: number, when: number, fadeIn = false): void {
    const offset = this.adapter.musicOffset();
    const start = Math.max(0, from + offset);
    const end = Math.min(buffer.duration, to + offset);
    if (end > start) this.playBuffer(buffer, when + (start - from - offset) / this.speed, start, null, end - start, fadeIn);
  }

  private queueMusic(now: number): void {
    const loop = this.range;
    if (!loop || !Number.isFinite(this.nextMusicAt)) return;
    const buffer = this.adapter.music()!;
    const period = (loop.b - loop.a) / this.speed;
    if (this.nextMusicAt + period <= now) this.nextMusicAt += Math.floor((now - this.nextMusicAt) / period) * period;
    while (this.nextMusicAt <= now + Math.max(1, period)) {
      const when = Math.max(now, this.nextMusicAt);
      this.playMusicSlice(buffer, loop.a + (when - this.nextMusicAt) * this.speed, loop.b, when);
      this.nextMusicAt += period;
    }
  }

  private playBuffer(buffer: AudioBuffer, start: number, offset: number, loop: ClockLoop | null, duration?: number, fadeIn = false) {
    const context = this.adapter.context();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.speed;
    if (loop) {
      source.loopStart = loop.a;
      source.loopEnd = loop.b;
      source.loop = true;
    }
    const fade = fadeIn && this.adapter.lead ? context.createGain() : null;
    if (fade) {
      fade.gain.setValueAtTime(0, start);
      fade.gain.linearRampToValueAtTime(1, start + .015);
      fade.connect(this.adapter.output());
    }
    source.connect(fade ?? this.adapter.output());
    this.sources.set(source, fade);
    source.onended = () => {
      if (this.source === source) this.source = null;
      this.sources.delete(source);
      source.disconnect();
      fade?.disconnect();
      if (this.playing) this.queueMusic(context.currentTime);
    };
    source.start(start, offset, duration);
    return source;
  }

  private releaseSource(): void {
    for (const [source, fade] of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
      fade?.disconnect();
    }
    this.sources.clear();
    this.source = null;
    this.nextMusicAt = Infinity;
  }

  private changeLoop(): void {
    const { a, b } = this.loop;
    const next = a !== null && b !== null && a < b ? { a, b } : null;
    if (!next && !this.range) return;
    this.range = next;
    this.shortLoop = null;
    if (!this.playing) return;
    const now = this.schedulingClockTime();
    const jump = next !== null && this.clock.positionAt(now) >= next.b;
    this.clock.appendSegment(now, this.speed, next);
    this.releaseSource();
    this.planMusic(this.clock.positionAt(now), now);
    this.rescheduleSounds(jump);
  }

  rescheduleSounds(restart = false): void {
    if (!this.playing) return;
    const now = this.schedulingClockTime();
    this.soundLap = this.clock.lapAt(now);
    this.soundStart = now;
    this.adapter.resetSounds(this.clock.positionAt(now), restart || now <= this.anchor ? 'start' : 'speed');
    this.scheduleSounds();
  }

  private scheduleSounds(): void {
    const now = this.schedulingClockTime();
    const audioNow = this.silent ? this.adapter.context().currentTime : now;
    const lap = this.clock.lapAt(now);
    const loop = this.range;
    if (lap > this.soundLap) {
      this.soundLap = lap;
      this.soundStart = now;
      this.adapter.rewindSounds(this.clock.positionAt(now), audioNow);
    }
    const at = Math.max(now, this.soundStart);
    const position = this.soundLap > lap ? loop!.a : this.clock.positionAt(now);
    this.adapter.schedule(position, audioNow + at - now, this.speed, this.loopEnd);
    if (!loop) return;
    const period = (loop.b - loop.a) / this.speed;
    /* 一帧至多预排可听见的十六圈，极短区间按实际音频时钟追上。 */
    const horizon = now + .08;
    let boundary = at + (loop.b - position) / this.speed;
    for (let queued = Math.max(0, this.soundLap - lap); boundary <= horizon && queued < 16; queued++) {
      const when = audioNow + boundary - now;
      this.soundStart = boundary;
      this.soundLap++;
      this.adapter.rewindSounds(loop.a, when);
      this.adapter.schedule(loop.a, when, this.speed, loop.b);
      boundary += period;
    }
  }

  setSpeed(speed: number): void {
    if (speed === this.speed) return;
    const position = this.currentTime;
    if (!this.playing) { this.speed = speed; return; }
    const context = this.adapter.context();
    const now = this.schedulingClockTime();
    const scheduled = this.clock.positionAt(now);
    this.speed = speed;
    if (!this.range && this.source && this.songStart > context.currentTime && scheduled + this.adapter.musicOffset() < 0) {
      this.releaseSource();
      const lead = this.adapter.lead ?? 0;
      this.anchor = context.currentTime + lead;
      const start = lead ? position : scheduled;
      if (lead) this.clock.set(audioContextTime(this.anchor), musicPosition(start), speed);
      else this.clock.appendSegment(audioContextTime(this.anchor), speed);
      this.planMusic(start, this.anchor, true);
    } else {
      this.clock.appendSegment(now, speed);
      if (this.range && (!this.source || this.songStart > now)) {
        this.releaseSource();
        this.planMusic(scheduled, now);
      } else this.source?.playbackRate.setValueAtTime(speed, context.currentTime);
    }
    this.rescheduleSounds();
  }

  preview(seconds: number): void {
    if (this.disposed || this.playing) return;
    this.moveTo(seconds);
    this.onFrame?.(this.position, true);
  }

  invalidate(): void {
    if (this.disposed || this.playing || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (this.disposed || this.playing) return;
      try {
        this.onFrame?.(this.position, false);
      } catch (error) {
        this.failFrame(error, this.position);
      }
    });
  }

  async seek(seconds: number, resume = this.playing): Promise<void> {
    if (this.disposed) return;
    const target = this.clamp(seconds);
    if (resume && (target < this.adapter.duration() || this.loop.target(target) !== null)) {
      await this.playFrom(target);
      return;
    }
    this.stop();
    this.moveTo(target);
    this.adapter.onState?.(false);
    this.onFrame?.(target, true);
  }

  pause(): void {
    if (this.disposed) return;
    this.position = this.currentTime;
    this.stop();
    this.adapter.onState?.(false);
    this.onFrame?.(this.position, true);
  }

  private stop(): void {
    this.generation++;
    this.playing = false;
    this.silent = false;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.releaseSource();
    this.adapter.resetSounds(this.position, 'stop');
  }

  private startFrames(): void {
    const generation = this.generation;
    const tick = (timestamp: number) => {
      if (generation !== this.generation) return;
      this.frame = null;
      const heard = this.outputClockTime();
      this.clock.prune(heard);
      const position = this.clamp(this.clock.positionAt(heard));
      try {
        if (position >= this.adapter.duration()) {
          this.ended = true;
          this.pause();
          return;
        }
        this.queueMusic(this.adapter.context().currentTime);
        this.scheduleSounds();
        const lap = this.clock.lapAt(heard);
        const discontinuity = lap !== this.visibleLap;
        this.visibleLap = lap;
        withStageFrame(timestamp, () => this.onFrame?.(position, discontinuity));
        if (this.playing && generation === this.generation) this.frame = requestAnimationFrame(tick);
      } catch (error) {
        this.failFrame(error, position);
      }
    };
    if (this.playing) this.frame = requestAnimationFrame(tick);
  }

  private failFrame(error: unknown, position: number): void {
    this.position = position;
    this.stop();
    this.adapter.onState?.(false);
    if (this.adapter.onError) this.adapter.onError(error);
    else {
      const host = (window as Window & { ReactNativeWebView?: { postMessage(value: string): void } }).ReactNativeWebView;
      host?.postMessage(JSON.stringify({ type: 'error', message: '谱面播放中断，请重新加载。' }));
    }
  }

  private clamp(seconds: number): number {
    return Math.max(0, Math.min(this.adapter.duration(), seconds));
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.shortLoop = null;
    this.disposed = true;
    this.onFrame = undefined;
  }
}

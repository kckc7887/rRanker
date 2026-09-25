import { describe, expect, it } from 'vitest';
import {
  PhigrosPlaybackSession,
  type PhigrosPlaybackEnvironment,
  type PhigrosPlaybackSettings,
} from '@/features/phigros-chart-preview/webview-player/playback';

const MUSIC_DURATION_SECONDS = 30;

class FakeGainNode {
  readonly gain = {
    value: 1,
    cancelScheduledValues(): void {},
    setValueAtTime(): void {},
    linearRampToValueAtTime(): void {},
  };
  connect(): void {}
  disconnect(): void {}
}

class FakeAudioParam {
  value = 1;
  readonly scheduled: number[] = [];
  cancelScheduledValues(): void {}
  setValueAtTime(value: number): void {
    this.value = value;
    this.scheduled.push(value);
  }
  linearRampToValueAtTime(): void {}
}

class FakeSourceNode {
  buffer: AudioBuffer | null = null;
  readonly playbackRate = new FakeAudioParam();
  onended: (() => void) | null = null;
  startCount = 0;
  disconnected = false;

  connect(): void {}
  start(): void { this.startCount += 1; }
  stop(): void {}
  disconnect(): void { this.disconnected = true; }
  addEventListener(): void {}
}

class FakeAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  readonly destination = {} as AudioDestinationNode;
  readonly sources: FakeSourceNode[] = [];
  readonly gains: FakeGainNode[] = [];
  readonly music = { duration: MUSIC_DURATION_SECONDS } as AudioBuffer;
  private releaseResume: (() => void) | null = null;

  resume(): Promise<void> {
    if (this.state === 'running') return Promise.resolve();
    return new Promise((resolve) => {
      this.releaseResume = () => {
        this.state = 'running';
        resolve();
      };
    });
  }

  releaseResumeNow(): void {
    const release = this.releaseResume;
    this.releaseResume = null;
    release?.();
  }

  createGain(): GainNode {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeSourceNode();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  decodeAudioData(): Promise<AudioBuffer> {
    return Promise.resolve(this.music);
  }

  getOutputTimestamp(): AudioTimestamp {
    throw new Error('unsupported');
  }

  /** 仍被会话持有的音源：释放时会 disconnect。 */
  heldSourceCount(): number {
    return this.sources.filter((source) => !source.disconnected).length;
  }

  releasedSourceCount(): number {
    return this.sources.filter((source) => source.disconnected).length;
  }
}

class FakeFrameLoop {
  now = 0;
  private callbacks = new Map<number, (timestamp: number) => void>();
  private nextHandle = 1;

  readonly request = (callback: (timestamp: number) => void): number => {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  };

  readonly cancel = (handle: number): void => {
    this.callbacks.delete(handle);
  };

  get pending(): number {
    return this.callbacks.size;
  }

  advance(deltaMs: number): void {
    this.now += deltaMs;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback(this.now);
  }
}

function createPlayback() {
  const context = new FakeAudioContext();
  const frames = new FakeFrameLoop();
  const rendered: number[] = [];
  const playStates: boolean[] = [];
  const settings: PhigrosPlaybackSettings = { playbackSpeed: 1, volume: 1, hitSoundVolume: 1 };
  const environment: PhigrosPlaybackEnvironment = {
    createAudioContext: () => context as unknown as AudioContext,
    requestFrame: frames.request,
    cancelFrame: frames.cancel,
    now: () => frames.now,
  };
  const session = new PhigrosPlaybackSession({
    settings,
    environment,
    host: {
      render: (chartTime) => { rendered.push(chartTime); },
      onPlayStateChange: (playing) => { playStates.push(playing); },
    },
  });
  session.setChartTimeline({ durationSeconds: 30, offsetSeconds: 0 });
  session.setHitSoundEvents([]);
  return { session, context, frames, rendered, playStates, settings };
}

describe('Phigros 播放会话的播放状态所有权', () => {
  it('resume 未结算时暂停：旧 play Promise 不再启动播放', async () => {
    const { session, context, frames } = createPlayback();
    await session.loadMusic(new ArrayBuffer(8));

    const pending = session.play();
    expect(context.heldSourceCount()).toBe(0);

    session.pause();
    context.releaseResumeNow();
    await pending;

    expect(context.heldSourceCount()).toBe(0);
    expect(frames.pending).toBe(0);
    expect(session.playing).toBe(false);
  });

  it('resume 未结算时释放：旧 play Promise 不再启动播放', async () => {
    const { session, context, frames } = createPlayback();
    await session.loadMusic(new ArrayBuffer(8));

    const pending = session.play();
    session.dispose();
    context.releaseResumeNow();
    await pending;

    expect(context.heldSourceCount()).toBe(0);
    expect(frames.pending).toBe(0);
    expect(session.playing).toBe(false);
    expect(session.disposed).toBe(true);
  });

  it('同一会话只有当前音源与唯一 RAF，旧音源已释放', async () => {
    const { session, context, frames } = createPlayback();
    await session.loadMusic(new ArrayBuffer(8));

    const first = session.play();
    context.releaseResumeNow();
    await first;
    expect(context.sources).toHaveLength(1);
    expect(context.heldSourceCount()).toBe(1);
    expect(frames.pending).toBe(1);

    await session.play();
    expect(context.sources).toHaveLength(2);
    expect(context.heldSourceCount()).toBe(1);
    expect(context.releasedSourceCount()).toBe(1);
    expect(frames.pending).toBe(1);

    session.pause();
    expect(context.heldSourceCount()).toBe(0);
    expect(frames.pending).toBe(0);
  });

  it('播放中跳转只保留跳转后的音源与唯一 RAF', async () => {
    const { session, context, frames } = createPlayback();
    await session.loadMusic(new ArrayBuffer(8));
    const first = session.play();
    context.releaseResumeNow();
    await first;

    await session.seek(12);
    expect(session.chartTime).toBe(12);
    expect(context.sources).toHaveLength(2);
    expect(context.heldSourceCount()).toBe(1);
    expect(frames.pending).toBe(1);
  });

  it('位置与谱面时间轴归会话所有，moveTo 夹在谱面范围内', async () => {
    const { session } = createPlayback();
    expect(session.chartDuration).toBe(30);
    expect(session.chartOffset).toBe(0);

    session.moveTo(-4);
    expect(session.chartTime).toBe(0);
    session.moveTo(120);
    expect(session.chartTime).toBe(30);
    session.moveTo(9.5);
    expect(session.chartTime).toBe(9.5);
  });

  it('音频设置由宿主持有，会话只读取当前值', async () => {
    const { session, context, settings } = createPlayback();
    await session.loadMusic(new ArrayBuffer(8));
    const pending = session.play();
    context.releaseResumeNow();
    await pending;

    settings.volume = 0.25;
    settings.hitSoundVolume = 0.5;
    session.applyAudioSettings();
    expect(context.gains[0]!.gain.value).toBe(0.25);
    expect(context.gains[1]!.gain.value).toBe(0.5);

    settings.playbackSpeed = 1.5;
    session.applySpeedChange();
    expect(context.sources[0]!.playbackRate.value).toBe(1.5);
  });

  it('dispose 释放音源与 RAF 且幂等', async () => {
    const { session, context, frames } = createPlayback();
    await session.loadMusic(new ArrayBuffer(8));
    const pending = session.play();
    context.releaseResumeNow();
    await pending;

    session.dispose();
    session.dispose();

    expect(context.heldSourceCount()).toBe(0);
    expect(frames.pending).toBe(0);
  });
});

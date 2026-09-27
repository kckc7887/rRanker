import { describe, expect, it } from 'vitest';
import { parseSimaiChart, prepareAudioEvents } from '@/features/simai-chart-preview/engine';
import {
  SimaiPlaybackSession,
  type SimaiPlaybackEnvironment,
} from '@/features/simai-chart-preview/webview-player/playback';
import {
  beatsToMs,
  calculateMusicTime,
  createSimaiPlaybackTimeline,
  msToBeats,
  musicTimeToBeats,
  resolvePlaybackRange,
} from '@/features/simai-chart-preview/webview-player/timeConversion';

const MUSIC_DURATION_SECONDS = 30;

class FakeGainNode {
  readonly gain = {
    value: 1,
    cancelScheduledValues(): void {},
    setValueAtTime(): void {},
    linearRampToValueAtTime(): void {},
  };
  disconnectCount = 0;
  connect(): void {}
  disconnect(): void { this.disconnectCount += 1; }
}

class FakeSourceNode {
  buffer: AudioBuffer | null = null;
  readonly playbackRate = { value: 1, setValueAtTime(): void {} };
  onended: (() => void) | null = null;
  startCount = 0;
  stopCount = 0;
  disconnected = false;

  connect(): void {}
  start(): void { this.startCount += 1; }
  stop(): void { this.stopCount += 1; }
  disconnect(): void { this.disconnected = true; }
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

  /** 仍被会话持有的音源：旧音源在释放时会 stop + disconnect。 */
  heldSourceCount(): number {
    return this.sources.filter((source) => !source.disconnected).length;
  }

  releasedSourceCount(): number {
    return this.sources.filter((source) => source.disconnected).length;
  }
}

class FakeFrameLoop {
  /** 与性能时钟一致：页面已运行一段时间，静音看谱的首帧差值为正。 */
  now = 1000;
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
  const chart = parseSimaiChart('&inote_5=(120){4}1,2,3,4,5,6,7,8,', 5);
  const context = new FakeAudioContext();
  const frames = new FakeFrameLoop();
  const rendered: number[] = [];
  const playStates: boolean[] = [];
  const environment: SimaiPlaybackEnvironment = {
    createAudioContext: () => context as unknown as AudioContext,
    requestFrame: frames.request,
    cancelFrame: frames.cancel,
    now: () => frames.now,
  };
  const session = new SimaiPlaybackSession({
    charts: [chart],
    answerEvents: prepareAudioEvents(chart.notes),
    answerSoundUrl: 'data:audio/wav;base64,UklGRg==',
    environment,
    host: {
      render: (beats) => { rendered.push(beats); },
      onPlayStateChange: (playing) => { playStates.push(playing); },
    },
  });
  return { session, context, frames, rendered, playStates, chart };
}

describe('Simai 播放会话的播放状态所有权', () => {
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

  it('dispose 释放音源、增益节点与 RAF 且幂等', async () => {
    const { session, context, frames } = createPlayback();
    await session.loadMusic(new ArrayBuffer(8));
    const pending = session.play();
    context.releaseResumeNow();
    await pending;

    session.dispose();
    // 会话自有的音乐与正解音增益节点在释放时断开。
    const gainsAfterFirstDispose = context.gains.slice(0, 2).map((gain) => gain.disconnectCount);
    session.dispose();

    expect(context.heldSourceCount()).toBe(0);
    expect(frames.pending).toBe(0);
    expect(gainsAfterFirstDispose).toEqual([1, 1]);
    expect(context.gains.slice(0, 2).map((gain) => gain.disconnectCount)).toEqual(gainsAfterFirstDispose);
  });

  it('位置与播放范围归会话所有，moveTo 夹在播放范围内', async () => {
    const { session, chart } = createPlayback();
    const range = resolvePlaybackRange([chart], MUSIC_DURATION_SECONDS, 0);

    await session.loadMusic(new ArrayBuffer(8));
    expect(session.totalDurationMs).toBe(range.totalDurationMs);
    expect(session.totalBeats).toBe(range.totalBeats);

    session.moveTo(-5);
    expect(session.positionBeats).toBe(0);
    session.moveTo(range.totalBeats + 100);
    expect(session.positionBeats).toBe(range.totalBeats);
    session.moveTo(8);
    expect(session.positionBeats).toBe(8);
  });

  it('静音看谱按帧时间推进，且换算与既有 ms/拍语义一致', async () => {
    const { session, chart, context, frames } = createPlayback();
    await session.loadMusic(null);
    expect(session.musicDurationSeconds).toBeNull();

    const pending = session.play();
    context.releaseResumeNow();
    await pending;
    expect(frames.pending).toBe(1);

    frames.advance(1000);
    const expected = msToBeats(
      beatsToMs(0, chart.bpmEvents, chart.bpm) + 1000,
      chart.bpmEvents,
      chart.bpm,
    );
    expect(expected).toBeCloseTo(2);
    expect(session.positionBeats).toBeCloseTo(expected);
  });

  it('音乐模式按输出端时钟推进位置，并保持既有偏移语义', async () => {
    const { session, chart, context, frames } = createPlayback();
    await session.loadMusic(new ArrayBuffer(8));
    const pending = session.play();
    context.releaseResumeNow();
    await pending;

    // 谱面起点的音乐位置为负（引导拍），音源在 2 秒引导后开始，输出端时钟从 0.05 秒起计。
    context.currentTime = 1.05;
    frames.advance(16);
    const firstPosition = session.positionBeats;
    expect(firstPosition)
      .toBeCloseTo(musicTimeToBeats(-1, chart.bpmEvents, chart.bpm, 0, chart.firstMs ?? 0));
    expect(firstPosition).toBeCloseTo(2);

    context.currentTime = 2.05;
    frames.advance(16);
    expect(session.positionBeats).toBeCloseTo(musicTimeToBeats(0, chart.bpmEvents, chart.bpm, 0));
    expect(session.positionBeats - firstPosition).toBeCloseTo(2);
  });
});

describe('Simai 会话时间轴换算与既有函数一致', () => {
  it('拍、毫秒与音乐秒在同一偏移下互换', () => {
    const chart = parseSimaiChart('&first=1.5\n&inote_5=(150){4}1,2,(240)3,4,', 5);
    const range = resolvePlaybackRange([chart], MUSIC_DURATION_SECONDS, 250);
    const timeline = createSimaiPlaybackTimeline(chart, range.totalBeats, 250);

    expect(timeline.totalBeats).toBe(range.totalBeats);
    for (const beats of [0, 3.5, 16, range.totalBeats]) {
      expect(timeline.beatsToMs(beats)).toBe(beatsToMs(beats, chart.bpmEvents, chart.bpm));
      expect(timeline.musicSecondsAt(beats))
        .toBe(calculateMusicTime(beats, chart.bpmEvents, chart.bpm, 250, chart.firstMs));
      expect(timeline.beatsAtMusicSeconds(timeline.musicSecondsAt(beats))).toBeCloseTo(beats);
      expect(timeline.beatsAtMs(timeline.beatsToMs(beats))).toBeCloseTo(beats);
    }
  });
});

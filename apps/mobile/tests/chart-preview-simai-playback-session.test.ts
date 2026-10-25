import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMusicMedia } from './helpers/music-media';
import { parseSimaiChart, prepareAudioEvents } from '@/features/simai-chart-preview/engine';
import {
  SimaiPlaybackSession,
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
  startAt = 0;
  stopCount = 0;
  disconnected = false;

  connect(): void {}
  start(when = 0): void { this.startCount += 1; this.startAt = when; }
  stop(): void { this.stopCount += 1; }
  disconnect(): void { this.disconnected = true; }
}

class FakeAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  outputLatency = 0;
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

  heldSourceCount(): number {
    return this.sources.filter((source) => !source.disconnected).length;
  }

  releasedSourceCount(): number {
    return this.sources.filter((source) => source.disconnected).length;
  }
}

class FakeFrameLoop {
  constructor(private readonly context: FakeAudioContext) {}
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
    this.context.currentTime += deltaMs / 1000;
    vi.advanceTimersByTime(deltaMs);
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback(this.now);
  }
}

function createPlayback() {
  vi.useFakeTimers();
  const chart = parseSimaiChart('&inote_5=(120){4}1,2,3,4,5,6,7,8,', 5);
  const context = new FakeAudioContext();
  const frames = new FakeFrameLoop(context);
  const media = installMusicMedia(context, { duration: MUSIC_DURATION_SECONDS });
  const rendered: number[] = [];
  const playStates: boolean[] = [];
  const onPlaybackError = vi.fn();
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  vi.stubGlobal('requestAnimationFrame', frames.request);
  vi.stubGlobal('cancelAnimationFrame', frames.cancel);
  vi.spyOn(performance, 'now').mockImplementation(() => frames.now);
  const session = new SimaiPlaybackSession({
    charts: [chart],
    answerEvents: prepareAudioEvents(chart.notes),
    answerSoundUrl: 'data:audio/wav;base64,UklGRg==',
    host: {
      render: (beats) => { rendered.push(beats); },
      onPlayStateChange: (playing) => { playStates.push(playing); },
      onPlaybackError,
    },
  });
  return { session, context, frames, rendered, playStates, onPlaybackError, chart, ...media };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Simai 播放与取消', () => {
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

  it('重复播放沿用保调媒体，暂停后停止发声和绘制', async () => {
    const { session, context, frames, media } = createPlayback();
    await session.loadMusic(new ArrayBuffer(8));
    session.moveTo(8);

    const first = session.play();
    context.releaseResumeNow();
    await first;
    expect(media[0]!.paused).toBe(false);
    expect(media[0]!.preservesPitch).toBe(true);
    expect(frames.pending).toBe(1);

    await session.play();
    expect(media[0]!.paused).toBe(false);
    expect(frames.pending).toBe(1);

    session.pause();
    expect(media[0]!.paused).toBe(true);
    expect(frames.pending).toBe(0);
  });

  it('dispose 释放音源、增益节点与 RAF 且幂等', async () => {
    const { session, context, frames, media, urls } = createPlayback();
    await session.loadMusic(new ArrayBuffer(8));
    const pending = session.play();
    context.releaseResumeNow();
    await pending;

    session.dispose();
    const gainsAfterFirstDispose = context.gains.slice(0, 2).map((gain) => gain.disconnectCount);
    session.dispose();

    expect(context.heldSourceCount()).toBe(0);
    expect(media[0]!.paused).toBe(true);
    expect(urls.size).toBe(0);
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

  it('静音看谱按公共时钟推进，且换算与 ms/拍语义一致', async () => {
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

  it('音乐前导按原曲位置推进，并保持谱面偏移语义', async () => {
    const { session, chart, context, frames } = createPlayback();
    await session.loadMusic(new ArrayBuffer(8));
    const pending = session.play();
    context.releaseResumeNow();
    await pending;

    context.currentTime = 1;
    frames.advance(0);
    const firstPosition = session.positionBeats;
    expect(firstPosition)
      .toBeCloseTo(musicTimeToBeats(-1, chart.bpmEvents, chart.bpm, 0, chart.firstMs ?? 0));
    expect(firstPosition).toBeCloseTo(2);

    context.currentTime = 2;
    frames.advance(0);
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

it('AB 在谱尾先回跳，暂停不自启，倍速不改变端点，释放取消回跳帧', async () => {
  const { session, context, frames } = createPlayback();
  context.state = 'running';
  session.loop.toggle('a', 2);
  session.loop.toggle('b', session.totalBeats);
  session.moveTo(session.totalBeats - 1);
  await session.play();
  frames.advance(1000);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(session.positionBeats).toBe(2);
  expect(session.playing).toBe(true);
  session.pause();
  session.moveTo(session.totalBeats);
  frames.advance(1000);
  expect(session.positionBeats).toBe(session.totalBeats);
  session.setSpeed(2);
  await session.play();
  expect(session.positionBeats).toBe(2);
  session.dispose();
  frames.advance(1000);
  expect(session.playing).toBe(false);
});

it('音乐首次启动期间失败时显示错误且保持暂停', async () => {
  const { session, context, frames, media, options, playStates, onPlaybackError } = createPlayback();
  context.state = 'running';
  options.deferPlay = true;
  await session.loadMusic(new ArrayBuffer(8));
  session.moveTo(8);
  const pending = session.play();
  await vi.waitFor(() => expect(media[0]!.paused).toBe(false));
  media[0]!.fail();
  await pending;
  expect(session.playing).toBe(false);
  expect(playStates.at(-1)).toBe(false);
  expect(frames.pending).toBe(0);
  expect(onPlaybackError).toHaveBeenCalledTimes(1);
  session.dispose();
});

it('音乐启动等待期间跳转取消待播放请求，迟到响应不覆盖拖动位置', async () => {
  const { session, context, frames, media, options, onPlaybackError } = createPlayback();
  context.state = 'running';
  options.deferPlay = true;
  await session.loadMusic(new ArrayBuffer(8));
  session.moveTo(8);
  const pending = session.play();
  await vi.waitFor(() => expect(media[0]!.paused).toBe(false));
  session.moveTo(20);
  await pending;
  media[0]!.finishPlay();
  await Promise.resolve();
  frames.advance(0);
  expect(session.positionBeats).toBe(20);
  expect(session.playing).toBe(false);
  expect(media[0]!.paused).toBe(true);
  expect(frames.pending).toBe(0);
  expect(onPlaybackError).not.toHaveBeenCalled();
  session.dispose();
});

it('应答音沿媒体位置调度并保留既有提前量，不重复扣除输出延迟', async () => {
  const { session, context, frames } = createPlayback();
  context.state = 'running';
  context.currentTime = 1;
  context.outputLatency = 0.1;
  await session.loadMusic(new ArrayBuffer(8));
  session.moveTo(6);
  await session.play();
  frames.advance(0);
  expect(context.sources.length).toBeGreaterThan(0);
  expect(context.sources[0]!.startAt).toBeCloseTo(1.45);
  session.dispose();
});

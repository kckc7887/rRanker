import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeRizlineChartPreviewSettings } from '@/features/rizline-chart-preview/configuration';
import { PreviewSession } from '@/features/rizline-chart-preview/webview-player/playback';
import type { PreparedChart } from '@/features/rizline-chart-preview/webview-player/chart-prepare';
import type { RizlineRenderer } from '@/features/rizline-chart-preview/webview-player/renderer';
import { installMusicMedia } from './helpers/music-media';

class FakeSource {
  stopped = false;
  startAt = 0;
  buffer: AudioBuffer | null = null;
  playbackRate = { value: 1 };
  connect(): void {}
  disconnect(): void {}
  start(when = 0): void { this.startAt = when; }
  stop(): void { this.stopped = true; }
}

class FakeContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  sources: FakeSource[] = [];
  release: (() => void) | null = null;

  resume(): Promise<void> {
    return new Promise((resolve) => {
      this.release = () => {
        this.state = 'running';
        resolve();
      };
    });
  }

  createGain(): GainNode {
    return { gain: { value: 1 }, connect() {}, disconnect() {} } as unknown as GainNode;
  }

  createBuffer(_channels: number, length: number, sampleRate: number): AudioBuffer {
    return {
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length),
    } as unknown as AudioBuffer;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
}

const context = new FakeContext();

const chart = {
  bpm: 120,
  delaySeconds: 0,
  durationSeconds: 10,
  themes: [],
  challengeWindows: [],
  canvases: [],
  camera: { scaleSpans: [], xSpans: [] },
  lines: [],
} as unknown as PreparedChart;
const renderer = { setUserSpeed() {}, render() {} } as unknown as RizlineRenderer;
let animationFrames = 0;
let media: ReturnType<typeof installMusicMedia>;

async function session(prepared = chart, duration = 30, view = renderer): Promise<PreviewSession> {
  media.options.duration = duration;
  const preview = new PreviewSession(prepared, view, normalizeRizlineChartPreviewSettings({}));
  await preview.loadMusic(new Uint8Array([1, 2, 3]).buffer);
  return preview;
}

async function settle(pending: Promise<void>): Promise<void> {
  context.release?.();
  await pending;
}

beforeEach(() => {
  context.currentTime = 0;
  context.state = 'suspended';
  context.sources = [];
  context.release = null;
  animationFrames = 0;
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  media = installMusicMedia(context);
  vi.stubGlobal('requestAnimationFrame', () => ++animationFrames);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('Rizline 音频授权与取消', () => {
  it.each([3, -3])('谱面偏移 %s 秒参与播放结束时间', async (delaySeconds) => {
    const preview = await session({ ...chart, delaySeconds }, 1);
    expect(preview.duration).toBe(10 + delaySeconds + 0.25);
    preview.dispose();
  });

  it('没有音源的谱面尾段仍按新倍速连续前进', async () => {
    const preview = await session(chart, 1);
    await settle(preview.playFrom(2));
    expect(context.sources).toHaveLength(0);
    context.currentTime = 1;
    expect(preview.currentTime).toBeCloseTo(3);
    preview.setSettings({ playbackSpeed: 2 });
    context.currentTime = 2;
    expect(preview.currentTime).toBeCloseTo(5);
    preview.dispose();
  });
  it('suspended 上下文完成媒体准备，首次播放才请求音频授权并保持音调', async () => {
    const preview = await session();
    expect(context.release).toBeNull();
    expect(preview.duration).toBe(30);
    expect(media.media[0]!.preservesPitch).toBe(true);
    expect(media.media[0]!.paused).toBe(true);
    expect(context.state).toBe('suspended');
    expect(preview.playing).toBe(false);
    expect(context.sources).toHaveLength(0);
    const pending = preview.playFrom(0);
    expect(context.release).not.toBeNull();
    expect(context.sources).toHaveLength(0);
    await settle(pending);
    expect(context.state).toBe('running');
    expect(preview.playing).toBe(true);
    expect(media.media[0]!.paused).toBe(false);
    preview.dispose();
  });

  it('resume 完成且命令仍有效时才播放音乐', async () => {
    const preview = await session();
    const pending = preview.playFrom(4);
    expect(context.sources).toHaveLength(0);
    await settle(pending);
    expect(media.media[0]!.paused).toBe(false);
    expect(media.media[0]!.currentTime).toBe(4);
    expect(preview.playing).toBe(true);
    expect(animationFrames).toBe(1);
    preview.dispose();
  });

  it('播放中 seek 从目标位置继续播放', async () => {
    context.state = 'running';
    const preview = await session();
    await preview.playFrom(4);
    await preview.seek(8);
    expect(media.media[0]!.currentTime).toBe(8);
    expect(media.media[0]!.paused).toBe(false);
    expect(preview.playing).toBe(true);
    expect(preview.currentTime).toBe(8);
    preview.dispose();
  });

  it('pending resume 期间 pause 后不再创建音源或启动绘制', async () => {
    const preview = await session();
    const pending = preview.playFrom(4);
    preview.pause();
    await settle(pending);
    expect(context.sources).toHaveLength(0);
    expect(preview.playing).toBe(false);
    expect(animationFrames).toBe(0);
  });

  it('pending resume 期间 seek 后不再创建音源，位置停在 seek', async () => {
    const preview = await session();
    const pending = preview.playFrom(4);
    await preview.seek(8);
    await settle(pending);
    expect(context.sources).toHaveLength(0);
    expect(preview.playing).toBe(false);
    expect(preview.currentTime).toBe(8);
    expect(animationFrames).toBe(0);
  });

  it('pending resume 期间 dispose 后不再创建音源或启动绘制', async () => {
    const preview = await session();
    const pending = preview.playFrom(4);
    preview.dispose();
    await settle(pending);
    expect(context.sources).toHaveLength(0);
    expect(preview.playing).toBe(false);
    expect(preview.disposed).toBe(true);
    expect(animationFrames).toBe(0);
  });

  it.each(['pause', 'seek', 'dispose'] as const)('媒体播放尚未开始时 %s 阻止迟到播放恢复', async action => {
    context.state = 'running';
    media.options.deferPlay = true;
    const preview = await session();
    const pending = preview.playFrom(4);
    await vi.waitFor(() => expect(media.media[0]!.paused).toBe(false));
    if (action === 'seek') await preview.seek(8);
    else preview[action]();
    await pending;
    media.media[0]!.finishPlay();
    await Promise.resolve();
    expect(media.media[0]!.paused).toBe(true);
    expect(preview.playing).toBe(false);
    expect(animationFrames).toBe(0);
    if (action === 'seek') expect(preview.currentTime).toBe(8);
    preview.dispose();
    expect(media.urls.size).toBe(0);
  });

  it('准备音乐期间释放会话取消等待并回收媒体地址', async () => {
    media.options.deferLoad = true;
    const preview = new PreviewSession(chart, renderer, normalizeRizlineChartPreviewSettings({}));
    const pending = preview.loadMusic(new Uint8Array([1, 2, 3]).buffer);
    expect(media.urls.size).toBe(1);
    preview.dispose();
    await pending;
    media.media[0]!.finishLoad();
    expect(media.urls.size).toBe(0);
    expect(media.media[0]!.paused).toBe(true);
    expect(preview.playing).toBe(false);
  });

  it('音乐在支持范围内变速保调，进度继续使用媒体播放位置', async () => {
    context.state = 'running';
    const preview = await session();
    await preview.playFrom(4);
    for (const playbackSpeed of [0.5, 1, 1.5, 2]) {
      const before = preview.currentTime;
      preview.setSettings({ playbackSpeed });
      expect(preview.currentTime).toBeCloseTo(before);
      context.currentTime += 1;
      expect(preview.currentTime).toBeCloseTo(before + playbackSpeed);
      expect(media.media[0]!.playbackRate).toBe(playbackSpeed);
      expect(media.media[0]!.preservesPitch).toBe(true);
    }
    preview.pause();
    const pausedAt = preview.currentTime;
    context.currentTime += 10;
    expect(preview.currentTime).toBe(pausedAt);
    preview.dispose();
  });

  it('音乐等待时冻结画面并取消打击音，恢复后按媒体时间调度且失败后停止', async () => {
    context.state = 'running';
    let frame: FrameRequestCallback = () => {};
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
    const rendered: number[] = [];
    const view = { setUserSpeed() {}, render: (_chart: unknown, time: number) => rendered.push(time) } as unknown as RizlineRenderer;
    const prepared = { ...chart, lines: [{ notes: [{ seconds: 0.2, kind: 0 }] }] } as unknown as PreparedChart;
    const preview = await session(prepared, 30, view);
    preview.setSettings({ playbackSpeed: 2 });
    await preview.playFrom(0);
    frame(0);
    expect(context.sources[0]!.startAt).toBeCloseTo(0.1);
    expect(context.sources[0]!.playbackRate.value).toBe(1);
    context.currentTime = 0.02;
    media.media[0]!.wait();
    const waitingAt = preview.currentTime;
    expect(context.sources[0]!.stopped).toBe(true);
    context.currentTime = 1;
    frame(1000);
    expect(preview.currentTime).toBe(waitingAt);
    expect(rendered.at(-1)).toBe(waitingAt);
    expect(context.sources).toHaveLength(1);
    media.media[0]!.finishPlay();
    frame(1000);
    expect(context.sources[1]!.startAt).toBeCloseTo(1 + (0.2 - waitingAt) / 2);
    expect(context.sources[1]!.playbackRate.value).toBe(1);
    media.media[0]!.fail();
    expect(preview.playing).toBe(false);
    expect(context.sources[1]!.stopped).toBe(true);
    preview.dispose();
  });
});

describe('Rizline 偏移、短音频与会话释放', () => {
  async function observed(delaySeconds: number, musicDuration = 30) {
    const rendered: number[] = [];
    let pendingFrame: FrameRequestCallback | null = null;
    const cancelled: number[] = [];
    let handle = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pendingFrame = callback; return ++handle; });
    vi.stubGlobal('cancelAnimationFrame', (value: number) => { cancelled.push(value); pendingFrame = null; });
    const spy = { setUserSpeed() {}, render: (_chart: unknown, time: number) => { rendered.push(time); } } as unknown as RizlineRenderer;
    const preview = await session({ ...chart, delaySeconds }, musicDuration, spy);
    return { preview, rendered, cancelled, frame: () => pendingFrame, handle: () => handle };
  }

  it.each([2.5, -2.5, 0])('偏移 %s 秒时暂停 seek 向前和向后都绘制谱面时间 = 播放位置 - 偏移', async delay => {
    const { preview, rendered } = await observed(delay);
    for (const target of [6, 1, 9, 0, 6.5]) {
      await preview.seek(target);
      expect(rendered.at(-1)).toBeCloseTo(target - delay, 9);
      expect(preview.chartTime).toBeCloseTo(target - delay, 9);
    }
    preview.dispose();
  });

  it('音频短于谱面时尾段继续前进到总时长后停止并标记结束', async () => {
    const { preview, frame } = await observed(1, 2);
    await settle(preview.playFrom(1.5));
    expect(media.media[0]!.paused).toBe(false);
    expect(preview.duration).toBe(10 + 1 + 0.25);
    context.currentTime = 0.5;
    media.media[0]!.end();
    context.currentTime = 5;
    expect(preview.currentTime).toBeCloseTo(6.5);
    expect(preview.chartTime).toBeCloseTo(5.5);
    context.currentTime = 20;
    frame()?.(0);
    expect(preview.playing).toBe(false);
    expect(preview.ended).toBe(true);
    expect(preview.currentTime).toBe(preview.duration);
    preview.dispose();
  });

  it('从音频结束之后的位置开始不创建音源，倍速切换后仍连续前进，结束后再播放回到起点', async () => {
    const { preview, frame } = await observed(0, 1);
    await settle(preview.playFrom(4));
    expect(context.sources).toHaveLength(0);
    context.currentTime = 1;
    preview.setSettings({ playbackSpeed: 0.5 });
    context.currentTime = 3;
    expect(preview.currentTime).toBeCloseTo(6);
    context.currentTime = 100;
    frame()?.(0);
    expect(preview.ended).toBe(true);
    context.state = 'running';
    await preview.playFrom(preview.duration);
    expect(preview.currentTime).toBeCloseTo(0, 6);
    expect(media.media[0]!.paused).toBe(false);
    preview.dispose();
  });

  it('重复进入退出时每个播放中的会话都取消自己的帧回调且不再绘制', async () => {
    context.state = 'running';
    for (let round = 0; round < 2; round++) {
      const { preview, rendered, cancelled, handle } = await observed(round % 2 ? -1 : 1);
      await preview.playFrom(round);
      expect(handle()).toBe(1);
      preview.dispose();
      expect(cancelled).toEqual([1]);
      const drawn = rendered.length;
      await preview.seek(3);
      await preview.playFrom(3);
      expect(rendered).toHaveLength(drawn);
      expect(preview.playing).toBe(false);
      expect(media.urls.size).toBe(0);
    }
  });
});
it('AB 在音频末尾连续回跳，暂停拖动和改变倍速保留端点', async () => {
  let frame: FrameRequestCallback = () => {};
  context.state = 'running';
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  const preview = await session();
  preview.loop.toggle('a', 2); preview.loop.toggle('b', 30);
  await preview.playFrom(29);
  context.currentTime = 1; media.media[0]!.end();
  context.currentTime = 2; frame(2000);
  await vi.waitFor(() => expect(preview.playing).toBe(true));
  expect(preview.currentTime).toBe(2);
  expect(preview.playing).toBe(true);
  context.currentTime = 30; media.media[0]!.end();
  context.currentTime = 31; frame(31000);
  await vi.waitFor(() => expect(preview.playing).toBe(true));
  expect(preview.currentTime).toBe(2);
  preview.pause(); await preview.seek(30);
  expect(preview.currentTime).toBe(30); expect(preview.playing).toBe(false);
  preview.setSettings({ playbackSpeed: 2 });
  await preview.playFrom(30);
  expect(preview.currentTime).toBe(2);
  context.currentTime += 1; expect(preview.currentTime).toBe(4);
  preview.dispose(); frame(32000); expect(preview.playing).toBe(false);
});

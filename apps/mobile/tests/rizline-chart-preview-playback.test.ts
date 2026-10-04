import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeRizlineChartPreviewSettings } from '@/features/rizline-chart-preview/configuration';
import {
  decodeAudio,
  PreviewSession,
} from '@/features/rizline-chart-preview/webview-player/playback';
import type { PreparedChart } from '@/features/rizline-chart-preview/webview-player/chart-prepare';
import type { RizlineRenderer } from '@/features/rizline-chart-preview/webview-player/renderer';

class FakeSource {
  startCount = 0;
  stopped = false;
  offset = 0;
  buffer: AudioBuffer | null = null;
  playbackRate = { value: 1 };
  connect(): void {}
  disconnect(): void {}
  start(_when = 0, offset = 0): void { this.startCount += 1; this.offset = offset; }
  stop(): void { this.stopped = true; }
}

class FakeContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  sources: FakeSource[] = [];
  decodedBuffers: ArrayBuffer[] = [];
  release: (() => void) | null = null;

  decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer> {
    this.decodedBuffers.push(bytes);
    return Promise.resolve(music);
  }

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
const music = { duration: 30 } as AudioBuffer;

let animationFrames = 0;

function session(): PreviewSession {
  return new PreviewSession(chart, renderer, music, normalizeRizlineChartPreviewSettings({}));
}

async function settle(pending: Promise<void>): Promise<void> {
  context.release?.();
  await pending;
}

beforeEach(() => {
  context.currentTime = 0;
  context.state = 'suspended';
  context.sources = [];
  context.decodedBuffers = [];
  context.release = null;
  animationFrames = 0;
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  vi.stubGlobal('requestAnimationFrame', () => ++animationFrames);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('Rizline 音频授权与取消', () => {
  it.each([3, -3])('谱面偏移 %s 秒参与播放结束时间', (delaySeconds) => {
    const preview = new PreviewSession({ ...chart, delaySeconds }, renderer,
      { duration: 1 } as AudioBuffer, normalizeRizlineChartPreviewSettings({}));
    expect(preview.duration).toBe(10 + delaySeconds + 0.25);
    preview.dispose();
  });

  it('没有音源的谱面尾段仍按新倍速连续前进', async () => {
    const preview = new PreviewSession(chart, renderer,
      { duration: 1 } as AudioBuffer, normalizeRizlineChartPreviewSettings({}));
    await settle(preview.playFrom(2));
    expect(context.sources).toHaveLength(0);
    context.currentTime = 1;
    expect(preview.currentTime).toBeCloseTo(3);
    preview.setSettings({ playbackSpeed: 2 });
    context.currentTime = 2;
    expect(preview.currentTime).toBeCloseTo(5);
    preview.dispose();
  });
  it('suspended 上下文完成解码和暂停准备，首次播放才请求音频授权', async () => {
    const decoded = decodeAudio(new Uint8Array([1, 2, 3]).buffer);
    expect(context.release).toBeNull();
    await expect(decoded).resolves.toBe(music);
    expect(context.decodedBuffers).toHaveLength(1);
    expect(context.state).toBe('suspended');
    const preview = session();
    expect(preview.playing).toBe(false);
    expect(context.sources).toHaveLength(0);
    const pending = preview.playFrom(0);
    expect(context.release).not.toBeNull();
    expect(context.sources).toHaveLength(0);
    await settle(pending);
    expect(context.state).toBe('running');
    expect(preview.playing).toBe(true);
    expect(context.sources[0]!.startCount).toBe(1);
    preview.dispose();
  });

  it('resume 完成且命令仍有效时才创建音源', async () => {
    const preview = session();
    const pending = preview.playFrom(4);
    expect(context.sources).toHaveLength(0);
    await settle(pending);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]!.startCount).toBe(1);
    expect(preview.playing).toBe(true);
    expect(animationFrames).toBe(1);
    preview.dispose();
  });

  it('播放中 seek 替换音源并从目标位置继续播放', async () => {
    context.state = 'running';
    const preview = session();
    await preview.playFrom(4);
    await preview.seek(8);
    expect(context.sources[0]!.stopped).toBe(true);
    expect(context.sources[1]!.offset).toBe(8);
    expect(preview.playing).toBe(true);
    expect(preview.currentTime).toBe(8);
    preview.dispose();
  });

  it('pending resume 期间 pause 后不再创建音源或启动绘制', async () => {
    const preview = session();
    const pending = preview.playFrom(4);
    preview.pause();
    await settle(pending);
    expect(context.sources).toHaveLength(0);
    expect(preview.playing).toBe(false);
    expect(animationFrames).toBe(0);
  });

  it('pending resume 期间 seek 后不再创建音源，位置停在 seek', async () => {
    const preview = session();
    const pending = preview.playFrom(4);
    await preview.seek(8);
    await settle(pending);
    expect(context.sources).toHaveLength(0);
    expect(preview.playing).toBe(false);
    expect(preview.currentTime).toBe(8);
    expect(animationFrames).toBe(0);
  });

  it('pending resume 期间 dispose 后不再创建音源或启动绘制', async () => {
    const preview = session();
    const pending = preview.playFrom(4);
    preview.dispose();
    await settle(pending);
    expect(context.sources).toHaveLength(0);
    expect(preview.playing).toBe(false);
    expect(preview.disposed).toBe(true);
    expect(animationFrames).toBe(0);
  });
});

describe('Rizline 偏移、短音频与会话释放', () => {
  function observed(delaySeconds: number, musicDuration = 30) {
    const rendered: number[] = [];
    let pendingFrame: FrameRequestCallback | null = null;
    const cancelled: number[] = [];
    let handle = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pendingFrame = callback; return ++handle; });
    vi.stubGlobal('cancelAnimationFrame', (value: number) => { cancelled.push(value); pendingFrame = null; });
    const spy = { setUserSpeed() {}, render: (_chart: unknown, time: number) => { rendered.push(time); } } as unknown as RizlineRenderer;
    const preview = new PreviewSession({ ...chart, delaySeconds }, spy, { duration: musicDuration } as AudioBuffer,
      normalizeRizlineChartPreviewSettings({}));
    return { preview, rendered, cancelled, frame: () => pendingFrame, handle: () => handle };
  }

  it.each([2.5, -2.5, 0])('偏移 %s 秒时暂停 seek 向前和向后都绘制谱面时间 = 播放位置 - 偏移', async delay => {
    const { preview, rendered } = observed(delay);
    for (const target of [6, 1, 9, 0, 6.5]) {
      await preview.seek(target);
      expect(rendered.at(-1)).toBeCloseTo(target - delay, 9);
      expect(preview.chartTime).toBeCloseTo(target - delay, 9);
    }
    preview.dispose();
  });

  it('音频短于谱面时尾段继续前进到总时长后停止并标记结束', async () => {
    const { preview, frame } = observed(1, 2);
    await settle(preview.playFrom(1.5));
    expect(context.sources).toHaveLength(1);
    expect(preview.duration).toBe(10 + 1 + 0.25);
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
    const { preview, frame } = observed(0, 1);
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
    expect(context.sources).toHaveLength(1);
    preview.dispose();
  });

  it('重复进入退出时每个播放中的会话都取消自己的帧回调且不再绘制', async () => {
    context.state = 'running';
    for (let round = 0; round < 2; round++) {
      const { preview, rendered, cancelled, handle } = observed(round % 2 ? -1 : 1);
      await preview.playFrom(round);
      expect(handle()).toBe(1);
      preview.dispose();
      expect(cancelled).toEqual([1]);
      const drawn = rendered.length;
      await preview.seek(3);
      await preview.playFrom(3);
      expect(rendered).toHaveLength(drawn);
      expect(preview.playing).toBe(false);
    }
  });
});

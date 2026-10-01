import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeRizlineChartPreviewSettings } from '@/features/rizline-chart-preview/configuration';
import {
  decodeAudio,
  PreviewSession,
  type PreviewSessionEnvironment,
} from '@/features/rizline-chart-preview/webview-player/playback';
import type { PreparedChart } from '@/features/rizline-chart-preview/webview-player/chart-prepare';
import type { RizlineRenderer } from '@/features/rizline-chart-preview/webview-player/renderer';

class FakeSource {
  startCount = 0;
  buffer: AudioBuffer | null = null;
  playbackRate = { value: 1 };
  connect(): void {}
  disconnect(): void {}
  start(): void { this.startCount += 1; }
  stop(): void {}
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
/** 环境边界由构造参数注入：测试不改写任何全局对象。 */
const environment: PreviewSessionEnvironment = {
  getAudioContext: () => context as unknown as AudioContext,
  requestFrame: () => {
    animationFrames += 1;
    return animationFrames;
  },
  cancelFrame: () => {},
};

function session(): PreviewSession {
  return new PreviewSession(chart, renderer, music, normalizeRizlineChartPreviewSettings({}), environment);
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
});

describe('Rizline playFrom 等待 resume 时的命令代次', () => {
  it.each([3, -3])('谱面偏移 %s 秒参与播放结束时间', (delaySeconds) => {
    const preview = new PreviewSession({ ...chart, delaySeconds }, renderer,
      { duration: 1 } as AudioBuffer, normalizeRizlineChartPreviewSettings({}), environment);
    expect(preview.duration).toBe(10 + delaySeconds + 0.25);
    preview.dispose();
  });

  it('没有音源的谱面尾段仍按新倍速连续前进', async () => {
    const preview = new PreviewSession(chart, renderer,
      { duration: 1 } as AudioBuffer, normalizeRizlineChartPreviewSettings({}), environment);
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
    const decoded = decodeAudio(new Uint8Array([1, 2, 3]).buffer, environment);
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

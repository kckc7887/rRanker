import { afterEach, expect, it, vi } from 'vitest';
import { PreviewSession } from '@/features/osu-chart-preview/webview-player/playback';
import { AudioSync } from '@/features/osu-chart-preview/webview-player/engine-audio/AudioSync';

afterEach(() => vi.unstubAllGlobals());

it('osu! 会话循环先于自然结束，回跳同步音频和背景，暂停与释放阻止恢复', async () => {
  const context = { currentTime: 0 };
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  let frame: FrameRequestCallback = () => {};
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const audio = { outputTimeMs: 0, running: true, setSpeed() {}, setStoryboardEnabled() {}, pause() {}, destroy() {},
    playFrom: vi.fn(async (position: number) => { audio.outputTimeMs = position; }) };
  const media = { configure() {}, sync: vi.fn(), dispose() {} };
  const renderer = { options: { audioOffsetMs: 0 }, oldOffsetMs: 0, renderFrameAt: vi.fn(), stop() {} };
  type Args = ConstructorParameters<typeof PreviewSession>;
  const session = new PreviewSession({} as Args[0], { mode: 0 } as Args[1], { mode: 0 } as Args[2],
    {} as Args[3], renderer as unknown as Args[4], audio as unknown as Args[5], media as unknown as Args[6],
    { startMs: -1000, endMs: 9000, durationMs: 10000 } as Args[7], new AbortController(), {} as Args[9]);
  session.loop.toggle('a', 2000); session.loop.toggle('b', 10000);
  await session.playFrom(9000);
  audio.outputTimeMs = 11000;
  frame(2000);
  for (let i = 0; i < 4; i++) await Promise.resolve();
  expect(session.currentTimeMs).toBe(2000);
  expect(session.playing).toBe(true);
  expect(audio.playFrom).toHaveBeenLastCalledWith(2000);
  expect(media.sync).toHaveBeenLastCalledWith(1000, true, true);
  session.pause(); await session.seek(10000, false);
  expect(session.currentTimeMs).toBe(10000); expect(session.playing).toBe(false);
  await session.playFrom(10000); expect(session.currentTimeMs).toBe(2000);
  audio.playFrom.mockRejectedValueOnce(new Error('media failed'));
  audio.outputTimeMs = 11000;
  frame(3000);
  for (let i = 0; i < 6; i++) await Promise.resolve();
  expect(session.playing).toBe(false);
  session.destroy(); frame(4000);
  expect(session.playing).toBe(false);
  expect(session.disposed).toBe(true);
});

it.each([0, 1, 2, 3] as const)('osu! 模式 %i 的画面、背景与 AB 循环读取补偿后的音频时钟', async mode => {
  let frame: FrameRequestCallback = () => {};
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const sources: { stopped: boolean; start: ReturnType<typeof vi.fn> }[] = [];
  const context = { currentTime: 10, outputLatency: .2, destination: {}, resume: async () => {},
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    createBufferSource: () => {
      const source = { stopped: false, buffer: null, onended: null,
        playbackRate: { value: 1, setValueAtTime(value: number) { this.value = value; } },
        connect() {}, disconnect() {}, start: vi.fn(), stop() { this.stopped = true; } };
      sources.push(source);
      return source;
    } };
  const audio = new AudioSync({ ctx: context as unknown as AudioContext, songBuffer: { duration: 30 } as AudioBuffer,
    skinSounds: new Map(), mergedSounds: new Map(), mode, introOffsetMs: -1000, schedule: [] });
  const media = { configure() {}, sync: vi.fn(), dispose() {} };
  const renderer = { options: { audioOffsetMs: 0 }, oldOffsetMs: 0, renderFrameAt: vi.fn() };
  type Args = ConstructorParameters<typeof PreviewSession>;
  const session = new PreviewSession({} as Args[0], { mode } as Args[1], { mode } as Args[2],
    {} as Args[3], renderer as unknown as Args[4], audio, media as unknown as Args[6],
    { startMs: -1000, endMs: 9000, durationMs: 10000 }, new AbortController(), {} as Args[9]);
  try {
    await session.playFrom(0);
    context.currentTime = 10.5;
    await session.setSettings({ playbackSpeed: 2 });
    expect(session.currentTimeMs).toBeCloseTo(300);
    context.currentTime = 11;
    frame(0);
    expect(session.currentTimeMs).toBeCloseTo(1100);
    expect(renderer.renderFrameAt.mock.lastCall![0]).toBeCloseTo(100);
    expect(media.sync.mock.lastCall![0]).toBeCloseTo(100);
    await session.seek(4000, true);
    expect(sources.at(-1)!.start).toHaveBeenCalledWith(11, 3);
    session.loop.toggle('a', 2000); session.loop.toggle('b', 5000);
    context.currentTime = 11.7;
    frame(0);
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(session.currentTimeMs).toBe(2000);
    expect(media.sync).toHaveBeenLastCalledWith(1000, true, true);
    expect(sources.at(-1)!.start).toHaveBeenCalledWith(11.7, 1);
    session.pause();
    context.currentTime = 20;
    frame(0);
    expect(session.currentTimeMs).toBe(2000);
    expect(media.sync).toHaveBeenLastCalledWith(1000, false, true);
  } finally { session.destroy(); }
  expect(sources.every(source => source.stopped)).toBe(true);
});

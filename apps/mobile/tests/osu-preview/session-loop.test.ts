import { afterEach, expect, it, vi } from 'vitest';
import { PreviewSession } from '@/features/osu-chart-preview/webview-player/playback';
import { AudioSync } from '@/features/osu-chart-preview/webview-player/engine-audio/AudioSync';

afterEach(() => vi.unstubAllGlobals());

it.each([0, 1, 2, 3] as const)('osu! 模式 %i 的画面、背景与 AB 循环读取补偿后的音频时钟', async mode => {
  let frame: FrameRequestCallback = () => {};
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const sources: { loopStart: number; loopEnd: number; loop: boolean; stopped: boolean; start: ReturnType<typeof vi.fn> }[] = [];
  const context = { currentTime: 10, outputLatency: .2, destination: {}, resume: async () => {},
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    createBufferSource: () => {
      const source = { loopStart: 0, loopEnd: 0, loop: false, stopped: false, buffer: null, onended: null,
        playbackRate: { value: 1, setValueAtTime(value: number) { this.value = value; } },
        connect() {}, disconnect() {}, start: vi.fn(), stop() { this.stopped = true; } };
      sources.push(source);
      return source;
    } };
  const audio = new AudioSync({ ctx: context as unknown as AudioContext, songBuffer: { duration: 30 } as AudioBuffer, durationSeconds: 10,
    skinSounds: new Map(), mergedSounds: new Map(), mode, introOffsetMs: -1000, schedule: [] });
  const media = { configure() {}, sync: vi.fn(), dispose() {} };
  const renderer = { options: { audioOffsetMs: 0 }, oldOffsetMs: 0, renderFrameAt: vi.fn(), dispose() {} };
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
    expect(sources.at(-1)!.start.mock.lastCall!.slice(0, 2)).toEqual([11, 3]);
    session.loop.toggle('a', 2); session.loop.toggle('b', 5);
    const song = sources.at(-1)!;
    expect([song.loop, song.loopStart, song.loopEnd]).toEqual([true, 1, 4]);
    context.currentTime = 11.75;
    frame(0);
    expect(session.currentTimeMs).toBeCloseTo(2100);
    expect(media.sync.mock.lastCall![0]).toBeCloseTo(1100);
    expect(media.sync.mock.lastCall!.slice(1)).toEqual([true, true]);
    expect(song.stopped).toBe(false);
    session.pause();
    context.currentTime = 20;
    frame(0);
    expect(session.currentTimeMs).toBeCloseTo(2100);
    expect(media.sync.mock.lastCall![0]).toBeCloseTo(1100);
    expect(media.sync.mock.lastCall!.slice(1)).toEqual([false, true]);
  } finally { session.destroy(); }
  expect(sources.every(source => source.stopped)).toBe(true);
});

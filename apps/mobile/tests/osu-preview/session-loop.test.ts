import { afterEach, expect, it, vi } from 'vitest';
import { PreviewSession } from '@/features/osu-chart-preview/webview-player/playback';

afterEach(() => vi.unstubAllGlobals());

it('osu! 会话循环先于自然结束，回跳同步音频和背景，暂停与释放阻止恢复', async () => {
  const context = { currentTime: 0 };
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  let frame: FrameRequestCallback = () => {};
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const audio = { currentTimeMs: 0, setStoryboardEnabled() {}, pause() {}, destroy() {},
    playFrom: vi.fn(async (position: number) => { audio.currentTimeMs = position; }) };
  const media = { configure() {}, sync: vi.fn(), dispose() {} };
  const renderer = { options: { audioOffsetMs: 0 }, oldOffsetMs: 0, renderFrameAt: vi.fn(), stop() {} };
  type Args = ConstructorParameters<typeof PreviewSession>;
  const session = new PreviewSession({} as Args[0], { mode: 0 } as Args[1], { mode: 0 } as Args[2],
    {} as Args[3], renderer as unknown as Args[4], audio as unknown as Args[5], media as unknown as Args[6],
    { startMs: -1000, endMs: 9000, durationMs: 10000 } as Args[7], new AbortController(), {} as Args[9]);
  session.loop.toggle('a', 2000); session.loop.toggle('b', 10000);
  await session.playFrom(9000);
  context.currentTime = 2;
  frame(2000);
  for (let i = 0; i < 4; i++) await Promise.resolve();
  expect(session.currentTimeMs).toBe(2000);
  expect(session.playing).toBe(true);
  expect(audio.playFrom).toHaveBeenLastCalledWith(2000);
  expect(media.sync).toHaveBeenLastCalledWith(1000, true, true);
  session.pause(); await session.seek(10000, false);
  expect(session.currentTimeMs).toBe(10000); expect(session.playing).toBe(false);
  await session.playFrom(10000); expect(session.currentTimeMs).toBe(2000);
  session.destroy(); frame(4000);
  expect(session.playing).toBe(false);
  expect(session.disposed).toBe(true);
});

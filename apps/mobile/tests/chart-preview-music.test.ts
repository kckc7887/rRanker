import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicPlayback } from '@/features/chart-preview-shared/webview-player/music';
import { installMusicMedia } from './helpers/music-media';

const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
let context: { currentTime: number; state: AudioContextState; resume(): Promise<void> };
let environment: ReturnType<typeof installMusicMedia>;
let music: MusicPlayback;

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  context = { currentTime: 0, state: 'running', resume: async () => { context.state = 'running'; } };
  environment = installMusicMedia(context, { duration: 10 });
  music = new MusicPlayback(context as AudioContext, {} as AudioNode);
});

afterEach(() => {
  music.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('谱面音乐保调播放', () => {
  it('使用原音频字节准备媒体，读取时长并保持暂停', async () => {
    expect(await music.load(bytes, 'audio/mp4')).toBe(true);
    const media = environment.media[0]!;
    expect(await environment.urls.get(media.src)!.arrayBuffer()).toEqual(bytes);
    expect(environment.urls.get(media.src)!.type).toBe('audio/mp4');
    expect(media.preservesPitch).toBe(true);
    expect(music.duration).toBe(10);
    expect(music.playing).toBe(false);
    expect(media.paused).toBe(true);
    music.dispose();
    expect(environment.urls.size).toBe(0);
    expect(media.src).toBe('');
  });

  it('播放位置来自媒体，变速与暂停保持当前位置', async () => {
    await music.load(bytes);
    await music.playFrom(2, 2);
    context.currentTime = 1;
    expect(music.currentTime).toBe(4);
    music.setSpeed(0.5);
    context.currentTime = 3;
    expect(music.currentTime).toBe(5);
    expect(environment.media[0]!.playbackRate).toBe(0.5);
    expect(environment.media[0]!.preservesPitch).toBe(true);
    music.pause();
    context.currentTime = 8;
    expect(music.currentTime).toBe(5);
    expect(music.playing).toBe(false);
  });

  it('缓冲期间冻结位置并立即通知音效调用方，恢复后跟随媒体', async () => {
    await music.load(bytes);
    await music.playFrom(1, 2);
    const states: boolean[] = [];
    music.onStateChange = () => states.push(music.waiting);
    context.currentTime = 1;
    environment.media[0]!.wait();
    expect(music.waiting).toBe(true);
    context.currentTime = 20;
    expect(music.currentTime).toBe(3);
    environment.media[0]!.finishPlay();
    context.currentTime = 21;
    expect(music.currentTime).toBe(5);
    expect(states).toEqual([true, false]);
  });

  it('负前导按倍速推进，到音乐开始前停在零点', async () => {
    await music.load(bytes);
    environment.options.deferPlay = true;
    await music.playFrom(-4, 2);
    context.currentTime = 1;
    await vi.advanceTimersByTimeAsync(1000);
    expect(music.currentTime).toBe(-2);
    music.setSpeed(1);
    context.currentTime = 3;
    await vi.advanceTimersByTimeAsync(2000);
    expect(music.currentTime).toBe(0);
    expect(music.waiting).toBe(true);
    context.currentTime = 5;
    expect(music.currentTime).toBe(0);
    environment.media[0]!.finishPlay();
    await flush();
    context.currentTime = 6;
    expect(music.currentTime).toBe(1);
  });

  it('暂停撤销前导启动，恢复播放从暂停位置继续', async () => {
    await music.load(bytes);
    await music.playFrom(-2);
    context.currentTime = 1;
    music.pause();
    context.currentTime = 8;
    await vi.advanceTimersByTimeAsync(8000);
    expect(music.currentTime).toBe(-1);
    expect(environment.media[0]!.paused).toBe(true);
    await music.playFrom(music.currentTime);
    context.currentTime = 9;
    await vi.advanceTimersByTimeAsync(1000);
    expect(music.currentTime).toBe(0);
    expect(music.waiting).toBe(false);
  });

  it('音乐结束后继续谱尾，尾段变速保持连续并可跳回音乐', async () => {
    await music.load(bytes);
    await music.playFrom(9);
    context.currentTime = 1;
    environment.media[0]!.end();
    context.currentTime = 3;
    expect(music.currentTime).toBe(12);
    music.setSpeed(2);
    context.currentTime = 4;
    expect(music.currentTime).toBe(14);
    await music.seek(2);
    environment.media[0]!.dispatchEvent(new Event('ended'));
    context.currentTime = 5;
    expect(music.currentTime).toBe(4);
  });

  it('缺失或不可用音乐仍可用虚拟时钟看谱，暂停跳转不会自启', async () => {
    expect(await music.load(null)).toBe(false);
    await music.playFrom(-1, 2);
    context.currentTime = 2;
    expect(music.currentTime).toBe(3);
    music.pause();
    await music.seek(8);
    context.currentTime = 4;
    expect(music.currentTime).toBe(8);
    expect(music.playing).toBe(false);
    environment.options.deferLoad = true;
    const load = music.load(bytes);
    environment.media[0]!.fail();
    expect(await load).toBe(false);
    expect(environment.urls.size).toBe(0);
    await music.playFrom(12);
    context.currentTime = 5;
    expect(music.currentTime).toBe(13);
  });

  it('连续播放跳转只接受最新目标，尚未定位时冻结目标位置', async () => {
    await music.load(bytes);
    environment.options.deferSeek = true;
    const first = music.playFrom(2);
    const second = music.playFrom(7, 0.5);
    await first;
    context.currentTime = 50;
    expect(music.currentTime).toBe(7);
    expect(music.waiting).toBe(true);
    environment.media[0]!.finishSeek();
    await second;
    context.currentTime = 52;
    expect(music.currentTime).toBe(8);
  });

  it('暂停结算尚未结束的媒体播放，迟到完成不恢复声音', async () => {
    await music.load(bytes);
    environment.options.deferPlay = true;
    const pending = music.playFrom(0);
    music.pause();
    await pending;
    environment.media[0]!.finishPlay();
    await flush();
    expect(music.playing).toBe(false);
    expect(environment.media[0]!.paused).toBe(true);
    expect(music.currentTime).toBe(0);
  });

  it('音频上下文等待期间的暂停不会迟到启动媒体', async () => {
    await music.load(bytes);
    let resume!: () => void;
    context.state = 'suspended';
    context.resume = () => new Promise<void>(resolve => { resume = () => { context.state = 'running'; resolve(); }; });
    const pending = music.playFrom(4);
    music.pause();
    await pending;
    resume();
    await flush();
    expect(music.currentTime).toBe(4);
    expect(music.playing).toBe(false);
    expect(environment.media[0]!.paused).toBe(true);
  });

  it('新加载替换旧资源，释放期间到达的元数据不重建播放器', async () => {
    environment.options.deferLoad = true;
    const first = music.load(bytes);
    const old = environment.media[0]!;
    const second = music.load(bytes);
    old.finishLoad(30);
    expect(await first).toBe(false);
    expect(environment.urls.size).toBe(1);
    environment.media[1]!.finishLoad(12);
    expect(await second).toBe(true);
    expect(music.duration).toBe(12);
    const third = music.load(bytes);
    const last = environment.media[2]!;
    music.dispose();
    expect(await third).toBe(false);
    last.finishLoad(60);
    expect(environment.urls.size).toBe(0);
    expect(music.playing).toBe(false);
  });

  it('媒体播放失败停止会话并通知，错误不会留下运行中的时钟', async () => {
    await music.load(bytes);
    environment.options.deferPlay = true;
    const pending = music.playFrom(0);
    environment.media[0]!.rejectPlay();
    await expect(pending).rejects.toThrow('media play failed');
    expect(music.playing).toBe(false);
    const failedStart = music.playFrom(0);
    environment.media[0]!.fail();
    await expect(failedStart).rejects.toThrow('media error');
    expect(music.playing).toBe(false);
    environment.options.deferPlay = false;
    await music.playFrom(1);
    const states: boolean[] = [];
    music.onStateChange = () => states.push(music.playing);
    environment.media[0]!.fail();
    expect(states).toEqual([false]);
    context.currentTime = 5;
    expect(music.currentTime).toBe(1);
  });
});

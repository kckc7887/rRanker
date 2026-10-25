import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import { installMusicMedia } from '../helpers/music-media';
import { AudioSync, type AudioSyncInputs } from '../../src/features/osu-chart-preview/webview-player/engine-audio/AudioSync';

class FakeGain {
  gain = { value: 1 };
  disconnected = false;
  connect(_target: unknown): void {}
  disconnect(): void { this.disconnected = true; }
}

class FakeSource {
  buffer: AudioBuffer | null = null;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  starts: { when: number; offset: number }[] = [];
  stops = 0;
  disconnected = false;
  connect(_target: unknown): void {}
  disconnect(): void { this.disconnected = true; }
  start(when = 0, offset = 0): void { this.starts.push({ when, offset }); }
  stop(_when?: number): void { this.stops++; }
}

class FakeContext {
  currentTime = 10;
  sampleRate = 1000;
  destination = {};
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  resume: () => Promise<void> = async () => {};
  createGain(): GainNode {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }
  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
  createBuffer(_channels: number, length: number, sampleRate: number): AudioBuffer {
    return { duration: length / sampleRate, getChannelData: () => new Float32Array(length) } as unknown as AudioBuffer;
  }
  asAudioContext(): AudioContext { return this as unknown as AudioContext; }
}

function buffer(duration: number): AudioBuffer { return { duration } as AudioBuffer; }
function music(duration: number) { return { bytes: new Uint8Array([duration]).buffer, duration }; }
async function setup(extra: Partial<AudioSyncInputs> = {}) {
  const ctx = new FakeContext();
  const env = installMusicMedia(ctx, { duration: extra.song?.duration ?? 30 });
  const audio = new AudioSync({ ctx: ctx.asAudioContext(), song: null, skinSounds: new Map(), mergedSounds: new Map(),
    schedule: [], mode: 0, introOffsetMs: 0, ...extra });
  await audio.load();
  return { ctx, env, audio };
}
async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('preview audio timeline and lifecycle', () => {
  it('plays an immutable supplied schedule', async () => {
    const hit = buffer(1);
    const schedule = Object.freeze([{ beatmapMs: 0, type: 'normal' as const, sampleSet: 1, sampleIndex: 0, customFile: 'hit.wav' }]);
    const { audio, ctx } = await setup({ schedule, mergedSounds: new Map([['hit.wav', hit]]) });
    try {
      await audio.playFrom(0);
      assert.ok(ctx.sources.some(source => source.buffer === hit));
      assert.equal(schedule[0]!.beatmapMs, 0);
    } finally { audio.destroy(); }
  });

  it('toggles storyboard music without restarting the song or hitsounds and resumes in place', async () => {
    const hit = buffer(1);
    const { audio, ctx, env } = await setup({ song: music(30), mergedSounds: new Map([['hit.wav', hit]]),
      schedule: [{ beatmapMs: 1000, type: 'clap', sampleSet: 2, sampleIndex: 1, customFile: 'hit.wav' }],
      extraSamples: [{ timeMs: 0, audio: music(10), volume: .5 }] });
    try {
      await audio.playFrom(0); await settle();
      const song = env.media[0]!, sample = env.media[1]!, hitSource = ctx.sources[0]!;
      ctx.currentTime = 12;
      audio.setStoryboardEnabled(false);
      assert.equal(song.paused, false); assert.equal(hitSource.stops, 0);
      assert.equal(sample.paused, true); assert.equal(sample.src, '');
      ctx.currentTime = 14;
      audio.setStoryboardEnabled(true); await settle();
      assert.equal(song.currentTime, 4);
      assert.equal(env.media.at(-1)!.currentTime, 4);
      assert.equal(audio.currentTimeMs, 4000);
      audio.pause(); audio.setStoryboardEnabled(false);
      await audio.playFrom(5000); await settle();
      assert.equal(env.media.filter(media => media.src).length, 1);
    } finally { audio.destroy(); }
    assert.equal(env.urls.size, 0);
  });

  it('preserves the negative lead-in at changed speed and continues after natural music end', async () => {
    vi.useFakeTimers();
    const { audio, ctx, env } = await setup({ song: music(3), introOffsetMs: -2000 });
    try {
      audio.setSpeed(2); await audio.playFrom(0);
      assert.equal(env.media[0]!.paused, true);
      ctx.currentTime = 10.5;
      assert.equal(audio.currentTimeMs, 1000);
      ctx.currentTime = 11;
      await vi.advanceTimersByTimeAsync(1000);
      assert.equal(env.media[0]!.paused, false);
      assert.equal(env.media[0]!.preservesPitch, true);
      assert.equal(env.media[0]!.playbackRate, 2);
      ctx.currentTime = 12.5; env.media[0]!.end();
      ctx.currentTime = 13.5;
      assert.equal(audio.currentTimeMs, 7000);
    } finally { audio.destroy(); }
  });

  it('does not restart music at or beyond its end', async () => {
    const { audio, env } = await setup({ song: music(3) });
    try {
      await audio.playFrom(3000); assert.equal(env.media[0]!.paused, true);
      audio.pause(); await audio.playFrom(7000);
      assert.equal(env.media[0]!.paused, true); assert.equal(audio.currentTimeMs, 7000);
    } finally { audio.destroy(); }
  });

  it('restores long storyboard music at the current offset and releases old media on seek', async () => {
    const { audio, ctx, env } = await setup({ extraSamples: [{ timeMs: 1000, audio: music(10), volume: .4 }] });
    try {
      await audio.playFrom(4000); await settle();
      const first = env.media[0]!;
      assert.equal(first.currentTime, 3); assert.equal(first.preservesPitch, true);
      assert.equal(ctx.gains[2]!.gain.value, .4);
      audio.pause(); await audio.playFrom(6000); await settle();
      assert.equal(first.src, ''); assert.equal(first.paused, true);
      assert.equal(ctx.gains[2]!.disconnected, true);
      assert.equal(env.media[1]!.currentTime, 5);
      audio.pause(); await audio.playFrom(12000); await settle();
      assert.equal(env.urls.size, 0);
    } finally { audio.destroy(); }
  });

  it('starts a negative-time storyboard event at its own position', async () => {
    vi.useFakeTimers();
    const { audio, ctx, env } = await setup({ introOffsetMs: -3000,
      extraSamples: [{ timeMs: -2000, audio: music(1), volume: 1 }] });
    try {
      await audio.playFrom(0); await settle();
      assert.equal(env.media[0]!.paused, true);
      ctx.currentTime = 11; await vi.advanceTimersByTimeAsync(1000);
      assert.equal(env.media[0]!.paused, false);
      assert.equal(env.media[0]!.currentTime, 0);
    } finally { audio.destroy(); }
  });

  it('does not revive audio after disposal during context resume', async () => {
    const { audio, ctx, env } = await setup({ song: music(3), extraSamples: [{ timeMs: 0, audio: music(3), volume: 1 }] });
    let release: (() => void) | undefined;
    ctx.resume = () => new Promise(resolve => { release = resolve; });
    const pending = audio.playFrom(0);
    audio.destroy(); release!(); await pending; await settle();
    assert.equal(env.urls.size, 0); assert.equal(env.media[0]!.paused, true);
    assert.equal(ctx.gains.every(gain => gain.disconnected), true);
  });

  it('changes hit timing with music speed while retaining the original hit pitch', async () => {
    const hit = buffer(1);
    const { audio, ctx, env } = await setup({ song: music(30), mergedSounds: new Map([['hit.wav', hit]]),
      schedule: [{ beatmapMs: 2000, type: 'clap', sampleSet: 2, sampleIndex: 3, customFile: 'hit.wav' }] });
    try {
      audio.setSpeed(2); await audio.playFrom(0);
      assert.deepEqual(ctx.sources[0]!.starts, [{ when: 11, offset: 0 }]);
      assert.equal(ctx.sources[0]!.playbackRate.value, 1);
      ctx.currentTime = 10.5;
      assert.equal(audio.currentTimeMs, 1000);
      audio.setSpeed(.5);
      assert.equal(audio.currentTimeMs, 1000);
      assert.equal(env.media[0]!.playbackRate, .5);
      assert.equal(ctx.sources[0]!.stops, 1);
      assert.deepEqual(ctx.sources[1]!.starts, [{ when: 12.5, offset: 0 }]);
      ctx.currentTime = 11.5;
      assert.equal(audio.currentTimeMs, 1500);
    } finally { audio.destroy(); }
  });

  it('freezes effects with a stalled master and resumes them from actual media time', async () => {
    const hit = buffer(1);
    const { audio, ctx, env } = await setup({ song: music(30), mergedSounds: new Map([['hit.wav', hit]]),
      schedule: [{ beatmapMs: 1000, type: 'clap', sampleSet: 1, sampleIndex: 0, customFile: 'hit.wav' }],
      extraSamples: [{ timeMs: 0, audio: music(10), volume: 1 }] });
    try {
      await audio.playFrom(0); await settle();
      ctx.currentTime = 10.5; env.media[0]!.wait();
      assert.equal(audio.advancing, false);
      assert.equal(ctx.sources[0]!.stops, 1);
      assert.equal(env.media[1]!.src, '');
      ctx.currentTime = 15;
      assert.equal(audio.currentTimeMs, 500);
      env.media[0]!.finishPlay(); await settle();
      assert.equal(audio.advancing, true);
      assert.deepEqual(ctx.sources[1]!.starts, [{ when: 15.5, offset: 0 }]);
      assert.equal(env.media.at(-1)!.currentTime, .5);
      env.media[0]!.fail();
      assert.equal(audio.running, false);
    } finally { audio.destroy(); }
  });

  it('uses the latest master position after a delayed storyboard load and cancels late clips', async () => {
    const { audio, ctx, env } = await setup({ song: music(30), extraSamples: [{ timeMs: 0, audio: music(10), volume: 1 }] });
    try {
      env.options.deferLoad = true;
      await audio.playFrom(0);
      ctx.currentTime = 13;
      env.media[1]!.finishLoad(10); await settle();
      assert.equal(env.media[1]!.currentTime, 3);
      audio.setSpeed(1.5);
      assert.equal(env.media[1]!.playbackRate, 1.5);
      assert.equal(env.media[1]!.currentTime, 3);
      audio.pause(); await audio.playFrom(5000);
      const late = env.media.at(-1)!;
      audio.pause(); late.finishLoad(10); await settle();
      assert.equal(late.paused, true); assert.equal(late.src, '');
    } finally { audio.destroy(); }
  });

  it('realigns a storyboard clip after its playback starts late', async () => {
    vi.useFakeTimers();
    const { audio, ctx, env } = await setup({ song: music(30), extraSamples: [{ timeMs: 0, audio: music(10), volume: 1 }] });
    try {
      await audio.playFrom(0); await settle();
      const clip = env.media[1]!;
      ctx.currentTime = 11; clip.wait();
      ctx.currentTime = 12; clip.finishPlay();
      assert.equal(clip.currentTime, 1);
      await vi.advanceTimersByTimeAsync(500);
      assert.equal(clip.currentTime, 2);
      assert.equal(env.media[0]!.currentTime, 2);
    } finally { audio.destroy(); }
  });

  it('keeps the first hit after asynchronous music startup and reports failed playback', async () => {
    const hit = buffer(1);
    const { audio, ctx, env } = await setup({ song: music(30), mergedSounds: new Map([['hit.wav', hit]]),
      schedule: [{ beatmapMs: 0, type: 'normal', sampleSet: 1, sampleIndex: 0, customFile: 'hit.wav' }] });
    try {
      env.options.deferPlay = true;
      const first = audio.playFrom(0); await settle();
      ctx.currentTime = 11;
      env.media[0]!.finishPlay();
      ctx.currentTime = 11.02;
      await first;
      assert.equal(ctx.sources[0]!.buffer, hit);
      assert.ok(Math.abs(ctx.sources[0]!.starts[0]!.offset - .02) < .0001);
      const failed = audio.playFrom(1000); await settle();
      env.media[0]!.fail(); env.media[0]!.rejectPlay();
      await assert.rejects(failed);
      assert.equal(audio.running, false);
    } finally { audio.destroy(); }
  });
});

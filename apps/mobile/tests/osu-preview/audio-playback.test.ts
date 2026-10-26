import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { AudioSync, type AudioSyncInputs } from '../../src/features/osu-chart-preview/webview-player/engine-audio/AudioSync';

class FakeGain {
  gain = { value: 1 };
  disconnected = false;
  connect(_target: unknown): void {}
  disconnect(): void { this.disconnected = true; }
}

class FakeSource {
  buffer: AudioBuffer | null = null;
  rates: { when: number; value: number }[] = [];
  playbackRate = { value: 1, setValueAtTime: (value: number, when: number) => {
    this.rates.push({ when, value });
    this.playbackRate.value = value;
  } };
  private initialRate = 1;
  onended: (() => void) | null = null;
  starts: { when: number; offset: number }[] = [];
  stops = 0;
  disconnected = false;
  connect(_target: unknown): void {}
  disconnect(): void { this.disconnected = true; }
  start(when = 0, offset = 0): void {
    this.initialRate = this.playbackRate.value;
    this.starts.push({ when, offset });
  }
  stop(_when?: number): void { this.stops++; }
  positionAt(time: number): number {
    const start = this.starts[0]!;
    let position = start.offset, cursor = start.when, rate = this.initialRate;
    for (const change of this.rates) {
      if (change.when > time) break;
      position += Math.max(0, change.when - cursor) * rate;
      cursor = change.when;
      rate = change.value;
    }
    return position + Math.max(0, time - cursor) * rate;
  }
}

class FakeContext {
  currentTime = 10;
  outputLatency = 0;
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
function inputs(ctx: FakeContext, extra: Partial<AudioSyncInputs> = {}): AudioSyncInputs {
  return { ctx: ctx.asAudioContext(), songBuffer: null, skinSounds: new Map(), mergedSounds: new Map(),
    schedule: [], mode: 0, introOffsetMs: 0, ...extra };
}

describe('preview audio timeline and lifecycle', () => {
  it('plays an immutable supplied schedule', async () => {
    const ctx = new FakeContext();
    const hit = buffer(1);
    const schedule = Object.freeze([{ beatmapMs: 0, type: 'normal' as const, sampleSet: 1, sampleIndex: 0, customFile: 'hit.wav' }]);
    const audio = new AudioSync(inputs(ctx, { schedule, mergedSounds: new Map([['hit.wav', hit]]) }));
    try {
      await audio.playFrom(0);
      assert.ok(ctx.sources.some(source => source.buffer === hit));
      assert.equal(schedule[0]!.beatmapMs, 0);
    } finally { audio.destroy(); }
  });
  it('toggles storyboard Samples without restarting music or ordinary hitsounds, and resumes a long Sample in place', async () => {
    const ctx = new FakeContext();
    const song = buffer(30), sample = buffer(10), hit = buffer(1);
    const audio = new AudioSync(inputs(ctx, { songBuffer: song,
      mergedSounds: new Map([['hit.wav', hit]]),
      schedule: [{ beatmapMs: 1000, type: 'clap', sampleSet: 2, sampleIndex: 1, customFile: 'hit.wav' }],
      extraSamples: [{ timeMs: 0, buffer: sample, volume: 0.5 }] }));
    await audio.playFrom(0);
    const songSource = ctx.sources.find(source => source.buffer === song)!;
    const hitSource = ctx.sources.find(source => source.buffer === hit)!;
    const sampleSource = ctx.sources.find(source => source.buffer === sample)!;
    ctx.currentTime = 12;
    audio.setStoryboardEnabled(false);
    assert.equal(songSource.stops, 0);
    assert.equal(hitSource.stops, 0);
    assert.equal(sampleSource.stops, 1);
    assert.equal(sampleSource.disconnected, true);
    ctx.currentTime = 14;
    audio.setStoryboardEnabled(true);
    assert.equal(ctx.sources.filter(source => source.buffer === song).length, 1);
    assert.deepEqual(ctx.sources.at(-1)!.starts, [{ when: 14, offset: 4 }]);
    assert.equal(audio.currentTimeMs, 4000);
    audio.pause();
    audio.setStoryboardEnabled(false);
    await audio.playFrom(5000);
    assert.equal(ctx.sources.filter(source => source.buffer === sample).length, 2);
    audio.destroy();
  });
  it('delays music during negative lead-in and continues the clock after natural audio end', async () => {
    const ctx = new FakeContext();
    const audio = new AudioSync(inputs(ctx, { songBuffer: buffer(3), introOffsetMs: -2000 }));
    await audio.playFrom(0);
    assert.deepEqual(ctx.sources[0]!.starts, [{ when: 12, offset: 0 }]);
    ctx.sources[0]!.onended?.();
    ctx.currentTime = 20;
    assert.equal(audio.currentTimeMs, 10000);
    audio.destroy();
  });

  it('never replays the last millisecond when seeking to or beyond the music end', async () => {
    const ctx = new FakeContext();
    const audio = new AudioSync(inputs(ctx, { songBuffer: buffer(3) }));
    await audio.playFrom(3000);
    assert.equal(ctx.sources.length, 0);
    audio.pause();
    await audio.playFrom(7000);
    assert.equal(ctx.sources.length, 0);
    assert.equal(audio.currentTimeMs, 7000);
    audio.destroy();
  });

  it('restores a long storyboard Sample at its actual offset and cancels old nodes on seek', async () => {
    const ctx = new FakeContext();
    const sample = buffer(10);
    const audio = new AudioSync(inputs(ctx, { extraSamples: [{ timeMs: 1000, buffer: sample, volume: 0.4 }] }));
    await audio.playFrom(4000);
    assert.deepEqual(ctx.sources[0]!.starts, [{ when: 10, offset: 3 }]);
    assert.equal(ctx.gains[2]!.gain.value, 0.4);
    audio.pause();
    await audio.playFrom(6000);
    assert.equal(ctx.sources[0]!.stops, 1);
    assert.equal(ctx.sources[0]!.disconnected, true);
    assert.equal(ctx.gains[2]!.disconnected, true);
    assert.deepEqual(ctx.sources[1]!.starts, [{ when: 10, offset: 5 }]);
    audio.pause();
    assert.equal(ctx.sources[1]!.stops, 1);
    audio.pause();
    await audio.playFrom(12000);
    await audio.playFrom(12000);
    assert.equal(ctx.sources.length, 2);
    audio.destroy();
  });

  it('starts a Sample in negative map time without shifting its timeline to the song', async () => {
    const ctx = new FakeContext();
    const audio = new AudioSync(inputs(ctx, { introOffsetMs: -3000,
      extraSamples: [{ timeMs: -2000, buffer: buffer(1), volume: 1 }] }));
    await audio.playFrom(0);
    assert.deepEqual(ctx.sources[0]!.starts, [{ when: 11, offset: 0 }]);
    audio.destroy();
  });

  it('does not schedule late audio when destroy happens while AudioContext resumes', async () => {
    const ctx = new FakeContext();
    let release: (() => void) | undefined;
    ctx.resume = () => new Promise(resolve => { release = resolve; });
    const audio = new AudioSync(inputs(ctx, { songBuffer: buffer(3), extraSamples: [{ timeMs: 0, buffer: buffer(3), volume: 1 }] }));
    const pending = audio.playFrom(0);
    audio.destroy();
    release!();
    await pending;
    assert.equal(ctx.sources.length, 0);
    assert.equal(ctx.gains.every(gain => gain.disconnected), true);
  });

  it('plays the custom sample at its scheduled time', async () => {
    const ctx = new FakeContext();
    const custom = buffer(1);
    const audio = new AudioSync(inputs(ctx, {
      mergedSounds: new Map([['hit.wav', custom]]),
      schedule: [{ beatmapMs: 1000, type: 'clap', sampleSet: 2, sampleIndex: 3, customFile: 'hit.wav',
        source: { objectId: 'object:17:edge:2', normalSet: 1, additionSet: 2 } }],
    }));
    await audio.playFrom(0);
    assert.equal(ctx.sources[0]!.buffer, custom);
    assert.deepEqual(ctx.sources[0]!.starts, [{ when: 11, offset: 0 }]);
    audio.destroy();
  });

  it('keeps playing music and overlapping Samples continuous while rescheduling only future hits and Samples', async () => {
    const ctx = new FakeContext();
    ctx.outputLatency = .2;
    const song = buffer(30), sample = buffer(10), future = buffer(5), hit = buffer(1);
    const audio = new AudioSync(inputs(ctx, { songBuffer: song, mergedSounds: new Map([['hit.wav', hit]]),
      schedule: [0, 2000].map(beatmapMs => ({ beatmapMs, type: 'normal', sampleSet: 1, sampleIndex: 0, customFile: 'hit.wav' })),
      extraSamples: [{ timeMs: 0, buffer: sample, volume: 1 }, { timeMs: 250, buffer: sample, volume: .5 },
        { timeMs: 1500, buffer: future, volume: 1 }] }));
    try {
      await audio.playFrom(0);
      const songSource = ctx.sources.find(source => source.buffer === song)!;
      const playingSamples = ctx.sources.filter(source => source.buffer === sample);
      const hits = ctx.sources.filter(source => source.buffer === hit);
      const oldFuture = ctx.sources.find(source => source.buffer === future)!;
      ctx.currentTime = 10.5;
      audio.setSpeed(2);
      assert.equal(songSource.stops, 0);
      assert.equal(playingSamples.every(source => source.stops === 0 && source.playbackRate.value === 2), true);
      assert.equal(hits[0]!.stops, 0);
      assert.equal(hits[0]!.playbackRate.value, 1);
      assert.equal(hits[1]!.stops, 1);
      assert.equal(oldFuture.stops, 1);
      const nextHit = ctx.sources.filter(source => source.buffer === hit).at(-1)!;
      const nextSample = ctx.sources.filter(source => source.buffer === future).at(-1)!;
      assert.deepEqual(nextHit.starts, [{ when: 11.25, offset: 0 }]);
      assert.equal(nextHit.playbackRate.value, 1);
      assert.deepEqual(nextSample.starts, [{ when: 11, offset: 0 }]);
      assert.equal(nextSample.playbackRate.value, 2);
      assert.ok(Math.abs(audio.outputTimeMs - 300) < 1e-8);
      ctx.currentTime = 10.6;
      assert.ok(Math.abs(audio.outputTimeMs - 400) < 1e-8);
      ctx.currentTime = 11;
      assert.ok(Math.abs(audio.outputTimeMs / 1000 - songSource.positionAt(10.8)) < 1e-8);
      audio.setSpeed(.5);
      ctx.currentTime = 11.5;
      assert.equal(audio.currentTimeMs, 1750);
      assert.ok(Math.abs(audio.outputTimeMs / 1000 - songSource.positionAt(11.3)) < 1e-8);
      assert.ok(Math.abs(playingSamples[1]!.positionAt(11.3) + .25 - songSource.positionAt(11.3)) < 1e-8);
      assert.equal(nextSample.stops, 0);
      assert.equal(nextSample.playbackRate.value, .5);
      const lastHit = ctx.sources.filter(source => source.buffer === hit).at(-1)!;
      assert.deepEqual(lastHit.starts, [{ when: 12, offset: 0 }]);
      audio.pause();
      assert.ok(Math.abs(audio.currentTimeMs - 1650) < 1e-8);
      assert.equal(ctx.sources.every(source => source.stops > 0), true);
    } finally { audio.destroy(); }
  });

  it('retimes a song that has not reached its negative lead-in boundary', async () => {
    const ctx = new FakeContext();
    const song = buffer(5), sample = buffer(3);
    const audio = new AudioSync(inputs(ctx, { songBuffer: song, introOffsetMs: -2000,
      extraSamples: [{ timeMs: -500, buffer: sample, volume: 1 }] }));
    try {
      await audio.playFrom(0);
      const oldSong = ctx.sources.find(source => source.buffer === song)!;
      ctx.currentTime = 10.5;
      audio.setSpeed(2);
      assert.equal(audio.currentTimeMs, 500);
      assert.equal(oldSong.stops, 1);
      const nextSong = ctx.sources.filter(source => source.buffer === song).at(-1)!;
      const nextSample = ctx.sources.filter(source => source.buffer === sample).at(-1)!;
      assert.deepEqual(nextSong.starts, [{ when: 11.25, offset: 0 }]);
      assert.deepEqual(nextSample.starts, [{ when: 11, offset: 0 }]);
      ctx.currentTime = 11.5;
      assert.equal(audio.currentTimeMs, 2500);
      assert.equal(nextSong.positionAt(11.5), .5);
      assert.equal(nextSample.positionAt(11.5), 1);
      audio.setSpeed(.5);
      assert.equal(nextSong.stops, 0);
      ctx.currentTime = 12.5;
      assert.equal(audio.currentTimeMs, 3000);
      assert.equal(nextSong.positionAt(12.5), 1);
    } finally { audio.destroy(); }
  });

  it('seeks at the selected speed and cancels an older pending resume without reviving old audio', async () => {
    const ctx = new FakeContext();
    const pending: (() => void)[] = [];
    ctx.resume = () => new Promise(resolve => pending.push(resolve));
    const song = buffer(30), sample = buffer(10);
    const audio = new AudioSync(inputs(ctx, { songBuffer: song,
      extraSamples: [{ timeMs: 1000, buffer: sample, volume: 1 }] }));
    try {
      const old = audio.playFrom(0);
      audio.setSpeed(2);
      const latest = audio.playFrom(4000);
      pending[1]!(); await latest;
      pending[0]!(); await old;
      const music = ctx.sources.find(source => source.buffer === song)!;
      const clip = ctx.sources.find(source => source.buffer === sample)!;
      assert.deepEqual(music.starts, [{ when: 10, offset: 4 }]);
      assert.deepEqual(clip.starts, [{ when: 10, offset: 3 }]);
      assert.equal(music.playbackRate.value, 2);
      assert.equal(clip.playbackRate.value, 2);
      ctx.currentTime = 11;
      assert.equal(audio.outputTimeMs, 6000);
      const cancelled = audio.playFrom(9000);
      audio.pause();
      pending[2]!(); await cancelled;
      assert.equal(audio.running, false);
      assert.equal(ctx.sources.every(source => source.stops > 0 && source.disconnected), true);
    } finally { audio.destroy(); }
  });
});

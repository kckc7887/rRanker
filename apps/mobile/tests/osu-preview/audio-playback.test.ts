import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { AudioSync, type AudioSyncInputs } from '../../src/features/osu-chart-preview/webview-player/engine-audio/AudioSync';
import { parseBeatmap } from '../../src/features/osu-chart-preview/webview-player/engine';
import { fixtureOsu } from './fixtures';

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
function inputs(ctx: FakeContext, extra: Partial<AudioSyncInputs> = {}): AudioSyncInputs {
  return { ctx: ctx.asAudioContext(), songBuffer: null, skinSounds: new Map(), mergedSounds: new Map(),
    hitResults: [], beatmap: parseBeatmap(fixtureOsu(0, 'Easy')), introOffsetMs: 0, ...extra };
}

describe('preview audio timeline and lifecycle', () => {
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
    assert.deepEqual(audio.getMixdownInputs().extraSamples, []);
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
    assert.equal(audio.isPlaying, true);
    audio.destroy();
  });

  it('never replays the last millisecond when seeking to or beyond the music end', async () => {
    const ctx = new FakeContext();
    const audio = new AudioSync(inputs(ctx, { songBuffer: buffer(3) }));
    await audio.playFrom(3000);
    assert.equal(ctx.sources.length, 0);
    await audio.seekTo(7000);
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
    await audio.seekTo(6000);
    assert.equal(ctx.sources[0]!.stops, 1);
    assert.equal(ctx.sources[0]!.disconnected, true);
    assert.equal(ctx.gains[2]!.disconnected, true);
    assert.deepEqual(ctx.sources[1]!.starts, [{ when: 10, offset: 5 }]);
    audio.pause();
    assert.equal(ctx.sources[1]!.stops, 1);
    assert.equal(audio.isPlaying, false);
    await audio.seekTo(12000);
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
    assert.equal(audio.isPlaying, false);
    assert.equal(ctx.gains.every(gain => gain.disconnected), true);
  });

  it('exposes the same source metadata that schedules the audible hit', async () => {
    const ctx = new FakeContext();
    const custom = buffer(1);
    const audio = new AudioSync(inputs(ctx, {
      mergedSounds: new Map([['hit.wav', custom]]),
      schedule: [{ beatmapMs: 1000, type: 'clap', sampleSet: 2, sampleIndex: 3, customFile: 'hit.wav',
        source: { objectId: 'object:17:edge:2', normalSet: 1, additionSet: 2 } }],
    }));
    assert.deepEqual(audio.hitSoundEvents, [{ beatmapMs: 1000, type: 'clap', sampleIndex: 3,
      objectId: 'object:17:edge:2', normalSet: 1, additionSet: 2 }]);
    await audio.playFrom(0);
    assert.equal(ctx.sources[0]!.buffer, custom);
    assert.deepEqual(ctx.sources[0]!.starts, [{ when: 11, offset: 0 }]);
    audio.destroy();
  });
});

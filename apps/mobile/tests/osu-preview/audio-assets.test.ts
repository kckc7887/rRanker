import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { loadPreviewAudio } from '../../src/features/osu-chart-preview/webview-player/audio-assets';
import type { PendingSound } from '../../src/features/osu-chart-preview/webview-player/engine-audio/hitsoundSchedule';

class DecodeContext {
  decoded: number[] = [];
  sampleRate = 1000;
  async decodeAudioData(value: ArrayBuffer): Promise<AudioBuffer> {
    const [id, seconds] = new Uint8Array(value);
    this.decoded.push(id!);
    if (id === 255) throw new Error('unsupported audio');
    return { duration: seconds } as AudioBuffer;
  }
  createBuffer(_channels: number, length: number, sampleRate: number): AudioBuffer {
    return { duration: length / sampleRate, getChannelData: () => new Float32Array(length) } as unknown as AudioBuffer;
  }
  asAudioContext(): AudioContext { return this as unknown as AudioContext; }
}

const audioBytes = (id: number, seconds: number) => new Uint8Array([id, seconds]);
function hit(customFile: string, beatmapMs = 1000): PendingSound {
  return { type: 'normal', sampleSet: 1, sampleIndex: 0, customFile, beatmapMs };
}
function request(ctx: DecodeContext, files: Map<string, Uint8Array>) {
  return { ctx: ctx.asAudioContext(), files, osuPath: 'set-a/map.osu', songName: 'audio.mp3', mode: 0 as const,
    schedule: [] as PendingSound[], samples: [], signal: new AbortController().signal, onWarning: (_message: string) => {} };
}

describe('preview decoded audio resources', () => {
  it('decodes only referenced resources in the selected directory and measures real Sample tails', async () => {
    const ctx = new DecodeContext();
    const files = new Map([
      ['set-a/audio.mp3', audioBytes(1, 4)], ['set-b/audio.mp3', audioBytes(2, 60)],
      ['set-a/SB/Hit.WAV', audioBytes(3, 2)], ['set-b/SB/Hit.WAV', audioBytes(4, 20)],
      ['set-a/outro.ogg', audioBytes(5, 8)], ['set-a/unused.mp3', audioBytes(6, 120)],
    ]);
    const result = await loadPreviewAudio({ ...request(ctx, files), schedule: [hit('sb\\hit.wav', 6000)],
      samples: [{ file: 'set-a/outro.ogg', timeMs: 5000, layer: 'Foreground', volume: 0.3 }] });
    assert.deepEqual(ctx.decoded.sort(), [1, 3, 5]);
    assert.equal(result.song?.duration, 4);
    assert.equal(result.sounds.get('sb/hit.wav')?.duration, 2);
    assert.equal(result.samples[0]!.buffer.duration, 8);
    assert.equal(result.samples[0]!.volume, 0.3);
    assert.equal(result.endMs, 13000);
  });

  it('deduplicates a resource shared by music, hit samples, and storyboard Samples', async () => {
    const ctx = new DecodeContext();
    const files = new Map([['set-a/audio.mp3', audioBytes(7, 4)]]);
    const result = await loadPreviewAudio({ ...request(ctx, files), schedule: [hit('audio.mp3')],
      samples: [{ file: 'set-a/audio.mp3', timeMs: 3000, layer: 'Background', volume: 1 }] });
    assert.deepEqual(ctx.decoded, [7]);
    assert.equal(result.song, result.sounds.get('audio.mp3'));
    assert.equal(result.song, result.samples[0]!.buffer);
    assert.equal(result.endMs, 7000);
  });

  it('reports missing and undecodable media while preserving the usable audio', async () => {
    const ctx = new DecodeContext();
    const files = new Map([['set-a/audio.mp3', audioBytes(1, 4)], ['set-a/bad.wav', audioBytes(255, 4)]]);
    const warnings: string[] = [];
    const result = await loadPreviewAudio({ ...request(ctx, files), schedule: [hit('missing.wav'), hit('bad.wav')],
      samples: [{ file: 'set-a/missing.ogg', timeMs: 3000, layer: 'Foreground', volume: 1 }],
      onWarning: message => warnings.push(message) });
    assert.equal(result.song?.duration, 4);
    assert.equal(result.sounds.size, 0);
    assert.deepEqual(result.samples, []);
    assert.equal(warnings.length, 3);
    assert.ok(result.endMs > 1000 && result.endMs < 2000);
  });

  it('never publishes a decode result after cancellation', async () => {
    const ctx = new DecodeContext();
    const controller = new AbortController();
    let finish: (() => void) | undefined;
    ctx.decodeAudioData = () => new Promise(resolve => { finish = () => resolve({ duration: 4 } as AudioBuffer); });
    const pending = loadPreviewAudio({ ...request(ctx, new Map([['set-a/audio.mp3', audioBytes(1, 4)]])), signal: controller.signal });
    controller.abort();
    finish?.();
    await assert.rejects(pending, error => error instanceof Error && error.name === 'AbortError');
  });

  it('includes a Fail-layer Sample in full content duration without playing it during perfect autoplay', async () => {
    const ctx = new DecodeContext();
    const files = new Map([['set-a/audio.mp3', audioBytes(1, 4)], ['set-a/fail.ogg', audioBytes(9, 120)]]);
    const result = await loadPreviewAudio({ ...request(ctx, files),
      samples: [{ file: 'set-a/fail.ogg', timeMs: 5000, layer: 'Fail', volume: 1 }] });
    assert.deepEqual(ctx.decoded.sort(), [1, 9]);
    assert.deepEqual(result.samples, []);
    assert.equal(result.endMs, 125000);
  });
});

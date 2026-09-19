import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseBeatmap } from '../../src/features/osu-chart-preview/webview-player/engine';
import { resolvePlaybackRange } from '../../src/features/osu-chart-preview/webview-player/playback-range';
import { fixtureOsu } from './fixtures';

function chart(objects: string[], mode: 0 | 1 | 2 | 3 = 0) {
  return parseBeatmap(fixtureOsu(mode, 'Easy').split('[HitObjects]')[0] + '[HitObjects]\n' + objects.join('\n'));
}

describe('complete preview playback range', () => {
  it('includes negative storyboard time, the song tail, and content beyond the final note', () => {
    const beatmap = chart(['256,192,1000,1,0,0:0:0:0:']);
    assert.deepEqual(resolvePlaybackRange(beatmap, 5000, { startMs: -2500, endMs: 8000 }, 9500), {
      startMs: -2500, endMs: 9500, durationMs: 12000,
    });
    assert.equal(resolvePlaybackRange(beatmap, 20000, { startMs: 0, endMs: 8000 }, 9500).endMs, 20000);
  });

  it('retains AudioLeadIn and native mania hold release when the music ends first', () => {
    const beatmap = chart(['64,192,1000,128,0,7000:0:0:0:0:'], 3);
    beatmap.audioLeadIn = 4000;
    assert.deepEqual(resolvePlaybackRange(beatmap, 3000, { startMs: -1000, endMs: 0 }), {
      startMs: -4000, endMs: 8000, durationMs: 12000,
    });
  });

  it('measures all slider repeats and spinner tails without relying on auto-replay frames', () => {
    const beatmap = chart([
      '128,192,1000,2,0,L|408:192,3,280',
      '256,192,500,8,0,5500',
    ]);
    assert.equal(resolvePlaybackRange(beatmap, null, { startMs: 0, endMs: 0 }).endMs, 6500);
    const sliderOnly = chart(['128,192,1000,2,0,L|408:192,3,280']);
    assert.equal(resolvePlaybackRange(sliderOnly, null, { startMs: 0, endMs: 0 }).endMs, 5000);
  });

  it('keeps a finite usable range for a silent empty chart', () => {
    const range = resolvePlaybackRange(chart([]), null, { startMs: 0, endMs: 0 });
    assert.ok(range.startMs === 0);
    assert.equal(range.endMs, 1000);
    assert.equal(range.durationMs, 1000);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseBeatmapVisuals, storyboardTimeRange } from '../../src/features/osu-chart-preview/webview-player/events';
import { compileStoryboardTriggers, type StoryboardHitSoundEvent } from '../../src/features/osu-chart-preview/webview-player/storyboard-triggers';
import { evaluateSprite } from '../../src/features/osu-chart-preview/webview-player/storyboard';

function sound(beatmapMs: number, overrides: Partial<StoryboardHitSoundEvent> = {}): StoryboardHitSoundEvent {
  return { beatmapMs, objectId: beatmapMs, normalSet: 1, additionSet: 2, sampleIndex: 3, type: 'normal', ...overrides };
}

function triggered(name: string) {
  return parseBeatmapVisuals(`[Events]
Sprite,Foreground,Centre,"flash.png",320,240
 T,${name},100,1000
  F,0,0,200,1,0
`).objects;
}

describe('autoplay storyboard triggers', () => {
  it('matches generic, normal bank, addition bank, sample index and double bank filters', () => {
    const clap = sound(500, { type: 'clap' });
    for (const name of ['HitSound', 'HitSoundNormal', 'HitSoundClap', 'HitSoundSoftClap', 'HitSoundAllSoft', 'HitSoundNormalSoftClap3', 'HitSound3']) {
      const [sprite] = compileStoryboardTriggers(triggered(name), [clap]);
      assert.equal(sprite!.triggerRuns!.length, 1, name);
      assert.equal(evaluateSprite(sprite!, 550)?.fade, 0.75, name);
    }
    for (const name of ['HitSoundDrum', 'HitSoundDrumClap', 'HitSoundWhistle', 'HitSoundNormalDrumClap3', 'HitSound2']) {
      const [sprite] = compileStoryboardTriggers(triggered(name), [clap]);
      assert.equal(sprite!.triggerRuns!.length, 0, name);
    }
  });

  it('does not fabricate Passing or Failing transitions in constant Pass autoplay', () => {
    for (const name of ['Passing', 'Failing']) {
      const [sprite] = compileStoryboardTriggers(triggered(name), [sound(500)]);
      assert.equal(evaluateSprite(sprite!, 550), null);
      assert.deepEqual(storyboardTimeRange([sprite!]), { startMs: 0, endMs: 0 });
    }
  });

  it('honours the inclusive trigger window and deduplicates samples belonging to one hit', () => {
    const [sprite] = compileStoryboardTriggers(triggered('HitSound'), [
      sound(99), sound(100), sound(500), sound(500, { type: 'clap' }), sound(1000), sound(1001),
    ]);
    assert.deepEqual(sprite!.triggerRuns!.map((run) => run.activationMs), [100, 500, 1000]);
    assert.deepEqual(storyboardTimeRange([sprite!]), { startMs: 0, endMs: 1200 });
    assert.equal(evaluateSprite(sprite!, 350), null);
    assert.equal(evaluateSprite(sprite!, 1050)?.fade, 0.75);
    assert.equal(evaluateSprite(sprite!, 150)?.fade, 0.75);
  });

  it('does not mix sample banks across simultaneous mania objects', () => {
    const [sprite] = compileStoryboardTriggers(triggered('HitSoundNormalSoftClap3'), [
      sound(500, { objectId: 1, type: 'clap', normalSet: 3, additionSet: 2 }),
      sound(500, { objectId: 2, type: 'normal', normalSet: 1, additionSet: 3 }),
    ]);
    assert.equal(sprite!.triggerRuns!.length, 0);
  });

  it('restarts a trigger and cancels other triggers in its explicit group', () => {
    const objects = parseBeatmapVisuals(`[Events]
Sprite,Foreground,Centre,"flash.png",0,0
 T,HitSoundClap,0,1000,8
  F,0,0,400,1,0
  M,0,0,400,0,0,400,0
 T,HitSoundFinish,0,1000,8
  F,0,0,100,0.5
  MX,0,0,100,900
`).objects;
    const [sprite] = compileStoryboardTriggers(objects, [sound(100, { type: 'clap' }), sound(200, { type: 'clap' }), sound(250, { type: 'finish' })]);
    assert.deepEqual(sprite!.triggerRuns!.map((run) => [run.start, run.end]), [[100, 200], [200, 250], [250, 350]]);
    assert.equal(evaluateSprite(sprite!, 225)?.x, 25);
    assert.equal(evaluateSprite(sprite!, 250)?.x, 900);
    assert.equal(evaluateSprite(sprite!, 351), null);
    assert.equal(evaluateSprite(sprite!, 150)?.x, 50);
  });

  it('waits for ordinary commands and respects delayed trigger command lifetimes', () => {
    const objects = parseBeatmapVisuals(`[Events]
Sprite,Foreground,Centre,"flash.png",0,0
 F,0,0,300,1
 T,HitSound,0,1000
  F,0,100,200,0.5
`).objects;
    const [sprite] = compileStoryboardTriggers(objects, [sound(200), sound(500)]);
    assert.equal(sprite!.triggerRuns!.length, 1);
    assert.equal(evaluateSprite(sprite!, 550), null);
    assert.equal(evaluateSprite(sprite!, 650)?.fade, 0.5);
    assert.equal(evaluateSprite(sprite!, 701), null);
  });
});

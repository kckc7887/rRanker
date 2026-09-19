import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseBeatmap, type HitResult } from '../../src/features/osu-chart-preview/webview-player/engine';
import {
  computeHitsoundSchedule,
  hitsoundEventsFromSchedule,
  lookupSkinSound,
  resolveSample,
  sampleLookupNames,
  type HitsoundScheduleInputs,
} from '../../src/features/osu-chart-preview/webview-player/engine-audio/hitsoundSchedule';
import { fixtureOsu } from './fixtures';

function mapWithObjects(objects: string[], mode: 0 | 1 | 2 | 3 = 0) {
  return parseBeatmap(fixtureOsu(mode, 'Easy').split('[HitObjects]')[0] + '[HitObjects]\n' + objects.join('\n'));
}

function result(objectIndex: number, time: number, hitSound = 0): HitResult {
  return { objectIndex, time, hitSound, judgement: 300, x: 256, y: 192, comboBreak: false };
}

function input(beatmap: ReturnType<typeof parseBeatmap>, hitResults: HitResult[]): HitsoundScheduleInputs {
  return { mode: beatmap.mode as 0 | 1 | 2 | 3, beatmap, hitResults, maniaSamples: null,
    taikoGhostTaps: null, comboFrames: [], oldOffsetMs: 0, fromBeatmapMs: -Infinity };
}

describe('preview hitsound source identity', () => {
  it('keeps simultaneous objects and their independent normal/addition banks separate', () => {
    const beatmap = mapWithObjects([
      '100,192,1000,1,8,1:2:3:65:',
      '200,192,1000,1,2,3:1:4:100:',
    ]);
    const sounds = computeHitsoundSchedule(input(beatmap, [result(0, 1000, 8), result(1, 1000, 2)]));
    const events = hitsoundEventsFromSchedule(sounds);
    assert.equal(events.length, 4);
    assert.equal(events[0]!.objectId, events[1]!.objectId);
    assert.equal(events[2]!.objectId, events[3]!.objectId);
    assert.notEqual(events[0]!.objectId, events[2]!.objectId);
    assert.deepEqual(events.map(({ normalSet, additionSet, sampleIndex, type }) =>
      [normalSet, additionSet, sampleIndex, type]), [
      [1, 2, 3, 'normal'], [1, 2, 3, 'clap'], [3, 1, 4, 'normal'], [3, 1, 4, 'whistle'],
    ]);
    assert.equal(sounds[0]!.volume, 0.65);
  });

  it('uses each slider node bank and never merges a coincident circle into its edge', () => {
    const beatmap = mapWithObjects([
      '100,192,1000,2,0,L|240:192,2,140,8|2|4,2:3|3:2|1:3,1:1:2:0:',
      '200,192,1500,1,8,2:1:5:100:',
    ]);
    const events = hitsoundEventsFromSchedule(computeHitsoundSchedule(input(beatmap, [result(0, 1000), result(1, 1500, 8)])));
    const head = events.filter(event => event.beatmapMs === 1000);
    assert.deepEqual(head.map(event => [event.normalSet, event.additionSet, event.type]), [[2, 3, 'normal'], [2, 3, 'clap']]);
    const edge = events.filter(event => event.beatmapMs === 1500 && event.objectId.includes(':edge:'));
    assert.deepEqual(edge.map(event => [event.normalSet, event.additionSet, event.type]), [[3, 2, 'normal'], [3, 2, 'whistle']]);
    assert.equal(new Set(events.filter(event => event.beatmapMs === 1500).map(event => event.objectId)).size, 2);
    assert.deepEqual(events.filter(event => event.beatmapMs === 2000).map(event => event.type), ['normal', 'finish']);
  });

  it('preserves mania hold sample identity while excluding silent body and tail judgements', () => {
    const beatmap = mapWithObjects(['64,192,1000,128,8,2000:2:3:4:75:'], 3);
    const head = { ...result(0, 1000, 8), subResult: 'head' as const };
    const request = input(beatmap, [head, { ...head, time: 1500, subResult: 'body' }, { ...head, time: 2000, subResult: 'tail' }]);
    request.maniaSamples = new Map([[0, beatmap.maniaHolds[0]!.hitSample]]);
    request.oldOffsetMs = 24;
    const sounds = computeHitsoundSchedule(request);
    assert.deepEqual(hitsoundEventsFromSchedule(sounds), [{
      beatmapMs: 1024, normalSet: 2, additionSet: 3, sampleIndex: 4, type: 'clap', objectId: 'mania:0:hit:0',
    }]);
    assert.equal(sounds[0]!.volume, 0.75);
  });

  it('retains taiko big-rim layers and keeps ghost taps distinct', () => {
    const beatmap = mapWithObjects(['256,192,1000,1,12,2:3:2:100:'], 1);
    const request = input(beatmap, [result(0, 1000, 12)]);
    request.taikoGhostTaps = [{ time: 1000, action: 'LeftCentre' }];
    const events = hitsoundEventsFromSchedule(computeHitsoundSchedule(request));
    assert.deepEqual(events.map(event => event.type), ['clap', 'whistle', 'normal']);
    assert.equal(events[0]!.objectId, events[1]!.objectId);
    assert.notEqual(events[0]!.objectId, events[2]!.objectId);
    assert.deepEqual([events[0]!.normalSet, events[0]!.additionSet], [2, 3]);
  });

  it('excludes catch tiny droplets and non-hit skin effects from storyboard triggers', () => {
    const beatmap = mapWithObjects(['256,192,1000,1,0,0:0:0:0:'], 2);
    const request = input(beatmap, [{ ...result(0, 1000), catchType: 'tinyDroplet' }]);
    request.comboFrames = [{ time: 800, combo: 30 }, { time: 1000, combo: 0 }];
    const sounds = computeHitsoundSchedule(request);
    assert.equal(sounds[0]!.type, 'combobreak');
    assert.deepEqual(hitsoundEventsFromSchedule(sounds), []);
  });

  it('resolves explicit sample filenames once, preserving subdirectory identity', () => {
    const wanted = { duration: 2 } as AudioBuffer;
    const unrelated = { duration: 3 } as AudioBuffer;
    const sounds = new Map([['SB/Kick.WAV', wanted], ['other/kick.wav', unrelated]]);
    assert.equal(lookupSkinSound(sounds, 'sb\\kick.wav'), wanted);
    assert.equal(lookupSkinSound(sounds, 'kick.wav'), null);
    assert.equal(resolveSample('normal', 1, 0, 'sb/kick.wav', {
      mode: 0, skinSounds: sounds, lazerDefaultSounds: null, synthCache: new Map(), ctx: {} as BaseAudioContext,
    }), wanted);
  });

  it('shares ordered resource lookup names with the audible resolver', () => {
    assert.deepEqual(sampleLookupNames('clap', 2, 3, '', 0), [
      'soft-hitclap3.wav', 'soft-hitclap3.mp3', 'soft-hitclap3.ogg',
      'soft-hitclap.wav', 'soft-hitclap.mp3', 'soft-hitclap.ogg',
      'hitclap3.wav', 'hitclap3.mp3', 'hitclap3.ogg',
    ]);
    assert.deepEqual(sampleLookupNames('normal', 1, 0, '', 1), [
      'taiko-normal-hitnormal.wav', 'taiko-normal-hitnormal.mp3', 'taiko-normal-hitnormal.ogg',
      'taiko-hitnormal.wav', 'taiko-hitnormal.mp3', 'taiko-hitnormal.ogg',
    ]);
    assert.deepEqual(sampleLookupNames('normal', 1, 0, 'SB\\Kick.WAV', 0), ['sb/kick.wav']);
    const numbered = { duration: 1 } as AudioBuffer;
    const fallback = { duration: 2 } as AudioBuffer;
    assert.equal(resolveSample('clap', 2, 3, '', {
      mode: 0, skinSounds: new Map([['soft-hitclap3.ogg', numbered], ['soft-hitclap.wav', fallback]]),
      lazerDefaultSounds: null, synthCache: new Map(), ctx: {} as BaseAudioContext,
    }), numbered);
  });
});

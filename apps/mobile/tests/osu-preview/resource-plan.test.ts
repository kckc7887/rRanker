import { describe, expect, it } from 'vitest';
import { parseBeatmap } from '../../src/features/osu-chart-preview/webview-player/engine/parsers/BeatmapParser';
import { decodeOsuText, findArchiveBytes, findArchiveResource, type PreviewResourceMap } from '../../src/features/osu-chart-preview/webview-player/osu-text';
import { selectPreviewOsbPaths, selectPreviewResources } from '../../src/features/osu-chart-preview/webview-player/resource-plan';
import { fixtureOsu } from './fixtures';
import { convertBeatmapToTaiko } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/taiko/converter';
import { convertBeatmapToCatch } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/catch/converter';
import { computeModDifficulty, synthesizeAutoReplay } from '../../src/features/osu-chart-preview/webview-player/engine';
import { slideDurationMs, sliderNestedEvents } from '../../src/features/osu-chart-preview/webview-player/engine/utils/sliderDuration';

describe('selected chart resource plan', () => {
  it('retains NaN inherited timing as normal velocity with slider ticks disabled', () => {
    const map = parseBeatmap(fixtureOsu(0, 'Native')
      .replace('0,500,4,1,0,100,1,0', '0,500,4,1,0,100,1,0\n500,NaN,4,1,0,100,0,0')
      .replace(/\[HitObjects\][\s\S]*$/, '[HitObjects]\n256,192,1000,2,0,L|396:192,2,140'));
    const slider = map.hitObjects[0]!;
    if (slider.type !== 'slider') throw new Error('slider required');
    expect(slideDurationMs(map, slider)).toBeCloseTo(500);
    for (const lazer of [false, true]) expect([...sliderNestedEvents(map, slider, 500, lazer)]).toEqual([
      { t: 1500, kind: 'repeat' }, { t: 2000, kind: 'tail' },
    ]);
    const objects = convertBeatmapToCatch(map, computeModDifficulty(map, synthesizeAutoReplay(map, '', [])));
    expect(objects.filter(object => object.type === 'fruit')).toHaveLength(3);
    expect(objects.some(object => object.type === 'droplet')).toBe(false);
    expect(objects.every(object => Number.isFinite(object.startTime) && Number.isFinite(object.effectiveX))).toBe(true);
    expect(objects.at(-1)!.startTime).toBeCloseTo(2000);
    const taiko = convertBeatmapToTaiko({ ...map, mode: 1 });
    expect(taiko[0]?.kind).toBe('drumroll');
    expect(taiko.every(object => Number.isFinite(object.time) && (object.kind === 'hit' || Number.isFinite(object.endTime)))).toBe(true);
  });
  it.each([
    ['SliderMultiplier: 1.4', 'SliderMultiplier: NaN'],
    ['SliderMultiplier: 1.4', 'SliderMultiplier: 0'],
    ['SliderTickRate: 1', 'SliderTickRate: Infinity'],
    ['CircleSize: 3', 'CircleSize: Infinity'],
    ['0,500,4,1,0,100,1,0', '0,Infinity,4,1,0,100,1,0'],
    ['0,500,4,1,0,100,1,0', '0,0,4,1,0,100,1,0'],
    ['256,192,0,1,0', '256,192,NaN,1,0'],
    ['256,192,0,1,0,0:0:0:0:', '256,192,1000,8,0,Infinity'],
  ])('rejects unusable numeric input before derived expansion: %s', (source, invalid) => {
    expect(() => parseBeatmap(fixtureOsu(0, 'Native').replace(source, invalid))).toThrow();
  });
  it('finishes a catch banana shower when float precision cannot advance its timestamp', () => {
    const map = parseBeatmap(fixtureOsu(2, 'Native').replace(/\[HitObjects\][\s\S]*$/, '[HitObjects]\n256,192,2147483648,8,0,2147483748'));
    const difficulty = computeModDifficulty(map, synthesizeAutoReplay(map, '', [], 0));
    const objects = convertBeatmapToCatch(map, difficulty);
    expect(objects.map(object => object.startTime)).toEqual([2147483648, 2147483748]);
    expect(objects.map(object => object.bananaIndex)).toEqual([0, 1]);
  });
  it('preserves sub-millisecond converted taiko hits instead of replacing them with a drumroll', () => {
    const map = parseBeatmap(fixtureOsu(0, 'Native')
      .replace(/\[HitObjects\][\s\S]*$/, '[HitObjects]\n256,192,1000,2,8,L|300:192,1000,0.1,2|4,0:0|0:0'));
    const objects = convertBeatmapToTaiko(map);
    expect(objects).toHaveLength(1001);
    expect(objects.every(object => object.kind === 'hit')).toBe(true);
    expect(objects[0]).toMatchObject({ kind: 'hit', time: 1000, hitSound: 2, isRim: true });
    expect(objects[1]).toMatchObject({ kind: 'hit', hitSound: 4, isStrong: true });
    expect(objects[2]).toMatchObject({ kind: 'hit', hitSound: 8, isRim: true });
    expect(objects[1]!.time - objects[0]!.time).toBeLessThan(1);
    expect(objects.at(-1)!.time).toBeCloseTo(1357, 6);
  });
  it.each(['0', '-1', '1.5', 'NaN', 'Infinity', '1x'])('rejects invalid repeat %s before derived work', repeat => {
    const text = fixtureOsu(0, 'Native').replace(/\[HitObjects\][\s\S]*$/, `[HitObjects]\n256,192,1000,2,0,L|300:192,${repeat},100`);
    expect(() => parseBeatmap(text)).toThrow('滑条重复次数');
  });
  it('decodes UTF16 in runtimes whose TextDecoder only supports UTF8, replacing malformed units', () => {
    const original = globalThis.TextDecoder;
    globalThis.TextDecoder = class extends original {
      constructor(encoding?: string, options?: TextDecoderOptions) {
        if (encoding && encoding !== 'utf-8') throw new Error('Only UTF8 supported');
        super(encoding, options);
      }
    };
    try {
      expect(decodeOsuText(new Uint8Array([0xff, 0xfe, 0x3d, 0xd8, 0x00, 0xde, 0x2d, 0x4e]))).toBe('😀中');
      expect(decodeOsuText(new Uint8Array([0xfe, 0xff, 0xd8, 0x3d, 0xde, 0x00, 0x4e, 0x2d]))).toBe('😀中');
      expect(decodeOsuText(new Uint8Array([0xff, 0xfe, 0x00, 0xd8, 0x41, 0x00, 0x00, 0xdc, 0xff]))).toBe('�A��');
      expect(decodeOsuText(new Uint8Array([0xff, 0xfe, 0xff]))).toBe('�');
    } finally { globalThis.TextDecoder = original; }
  });

  it('retains safe metadata IDs and BOM encoded text for exact chart selection', () => {
    const text = fixtureOsu(3, 'Native').replace('[Metadata]', '[Metadata]\nBeatmapID: 123\nBeatmapSetID: 456');
    const utf16 = new Uint8Array(2 + text.length * 2);
    utf16.set([0xfe, 0xff]);
    for (let i = 0; i < text.length; i++) { utf16[2 + i * 2] = text.charCodeAt(i) >>> 8; utf16[3 + i * 2] = text.charCodeAt(i) & 255; }
    expect(parseBeatmap(decodeOsuText(utf16))).toMatchObject({ beatmapId: 123, beatmapsetId: 456, mode: 3 });
    for (const invalid of ['-1', '1x', '0', '9007199254740992']) {
      expect(parseBeatmap(text.replace('BeatmapID: 123', `BeatmapID: ${invalid}`)).beatmapId).toBeNull();
    }
  });

  it('selects declared media and relevant sample candidates from the selected source directories', () => {
    const osuText = fixtureOsu(0, 'Native').replace('0,500,4,1,0,100,1,0', '0,500,4,1,2,100,1,0')
      .replace('[HitObjects]', '[Events]\n0,0,"BG.PNG",0,0\nVideo,100,"movie.mp4"\n[HitObjects]')
      .replace('0:0:0:0:', '0:0:0:0:custom');
    const availablePaths = ['set/map.osu', 'set/a.osb', 'other/a.osb', 'set/audio.mp3', 'other/audio.mp3',
      'set/bg.png', 'set/movie.mp4', 'set/custom.ogg', 'set/normal-hitnormal2.wav', 'set/normal-hitnormal9.wav',
      'set/shared.wav', 'set/sprite.png', 'other/stolen.png'];
    const result = selectPreviewResources({ osuText, osuPath: 'set/map.osu', availablePaths, osbSources: [
      { path: 'set/a.osb', text: '[Events]\nSprite,Foreground,Centre,"sprite.png",320,240\n F,0,0,1000,1\nSample,0,0,"shared.wav",100' },
      { path: 'other/a.osb', text: '[Events]\n0,0,"stolen.png",0,0' },
    ] });
    expect(result.osbPaths).toEqual(['set/a.osb']);
    expect(result.imagePaths.sort()).toEqual(['set/bg.png', 'set/sprite.png']);
    expect(result.videoPath).toBe('set/movie.mp4');
    expect(result.audioPaths.sort()).toEqual(['set/audio.mp3', 'set/custom.ogg', 'set/normal-hitnormal2.wav', 'set/shared.wav']);
    expect(selectPreviewOsbPaths('SET/map.osu', availablePaths)).toEqual(['set/a.osb']);
  });

  it('treats URI resources as present without substituting empty bytes or basename matches', () => {
    const bytes = new Uint8Array([7]);
    const resources: PreviewResourceMap = new Map<string, Uint8Array | { uri: string }>([
      ['set/bg.png', { uri: 'file:///private/bg.png' }], ['set/song.mp3', bytes],
    ]);
    expect(findArchiveResource(resources, 'BG.PNG', 'set/map.osu')?.resource).toEqual({ uri: 'file:///private/bg.png' });
    expect(findArchiveBytes(resources, 'BG.PNG', 'set/map.osu')).toBeUndefined();
    expect(findArchiveBytes(resources, 'song.mp3', 'set/map.osu')).toBe(bytes);
    expect(findArchiveResource(resources, 'bg.png', 'other/map.osu')).toBeUndefined();
    expect(findArchiveResource(resources, '../../set/bg.png', 'set/map.osu')).toBeUndefined();
  });
});

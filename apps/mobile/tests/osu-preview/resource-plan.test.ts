import { describe, expect, it } from 'vitest';
import { parseBeatmap } from '../../src/features/osu-chart-preview/webview-player/engine/parsers/BeatmapParser';
import { decodeOsuText, findArchiveBytes, findArchiveResource, type PreviewResourceMap } from '../../src/features/osu-chart-preview/webview-player/osu-text';
import { selectPreviewOsbPaths, selectPreviewResources } from '../../src/features/osu-chart-preview/webview-player/resource-plan';
import { fixtureOsu } from './fixtures';
import { convertBeatmapToTaiko } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/taiko/converter';

describe('selected chart resource plan', () => {
  /* eslint-disable no-extend-native -- Synchronous allocation guards; restore native push in finally before assertions. */
  it('represents enormous native taiko drumrolls without expanding their tick timeline', () => {
    const map = parseBeatmap(fixtureOsu(1, 'Native').replace(/\[HitObjects\][\s\S]*$/, '[HitObjects]\n256,192,1000,2,0,L|300:192,1000000000,100'));
    const push = Array.prototype.push;
    let appended = 0;
    Array.prototype.push = function (this: unknown[], ...items: unknown[]) {
      if ((appended += items.length) > 1000) throw new Error('eager tick expansion');
      return push.apply(this, items);
    };
    let objects: ReturnType<typeof convertBeatmapToTaiko>;
    try { objects = convertBeatmapToTaiko(map); } finally { Array.prototype.push = push; }
    expect(objects).toHaveLength(1);
    expect(objects[0]).toMatchObject({ kind: 'drumroll', tickInterval: 125 });
    expect(Object.values(objects[0]!).some(Array.isArray)).toBe(false);
  });
  it('keeps enormous legal slider repeats compact without filling default edge samples', () => {
    const text = fixtureOsu(0, 'Native').replace(/\[HitObjects\][\s\S]*$/, '[HitObjects]\n256,192,1000,2,8,L|300:192,1000000000,100,2|4,1:2|3:1,0:0:0:0:');
    const push = Array.prototype.push;
    let appended = 0;
    Array.prototype.push = function (this: unknown[], ...items: unknown[]) {
      appended += items.length;
      if (appended > 1000) throw new Error('eager repeat expansion');
      return push.apply(this, items);
    };
    let map: ReturnType<typeof parseBeatmap>;
    try { map = parseBeatmap(text); } finally { Array.prototype.push = push; }
    const slider = map.hitObjects[0]!;
    expect(slider.type).toBe('slider');
    if (slider.type !== 'slider') throw new Error('slider missing');
    expect(slider.slides).toBe(1000000000);
    expect(slider.edgeSounds).toEqual([2, 4]);
    expect(slider.edgeSets).toEqual([{ normalSet: 1, additionSet: 2 }, { normalSet: 3, additionSet: 1 }]);
  });
  it('bounds converted taiko slider hits by the timeline instead of the repeat count', () => {
    const convert = (slides: number, length: string) => convertBeatmapToTaiko(parseBeatmap(fixtureOsu(0, 'Native')
      .replace(/\[HitObjects\][\s\S]*$/, `[HitObjects]\n256,192,1000,2,0,L|300:192,${slides},${length}`)));
    const push = Array.prototype.push;
    let appended = 0;
    Array.prototype.push = function (this: unknown[], ...items: unknown[]) {
      if ((appended += items.length) > 5000) throw new Error('eager hit expansion');
      return push.apply(this, items);
    };
    try {
      const objects = convert(100000, '0.0001');
      expect(objects).toHaveLength(1);
      expect(objects[0]!.kind).toBe('drumroll');
    } finally { Array.prototype.push = push; }
    const ordinary = convert(1, '10');
    expect(ordinary.length).toBeGreaterThan(0);
    expect(ordinary.length).toBeLessThanOrEqual(8);
  });
  /* eslint-enable no-extend-native */
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

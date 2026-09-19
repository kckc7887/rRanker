import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { findArchiveEntry, listOsbSources, normalizeArchivePath, resolveArchivePath } from '../../src/features/osu-chart-preview/webview-player/osu-text';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('beatmap-relative resource paths', () => {
  it('resolves safe parent references but rejects archive escapes and external locations', () => {
    assert.equal(resolveArchivePath('..\\shared\\hit.wav', 'set/charts/map.osu'), 'set/shared/hit.wav');
    assert.equal(normalizeArchivePath('set/./images/../bg.jpg'), 'set/bg.jpg');
    for (const path of ['../../escape.wav', '/audio.wav', 'C:\\audio.wav', 'https://example.com/audio.wav', 'data:audio/wav;base64,a']) {
      assert.equal(resolveArchivePath(path, 'set/map.osu'), '', path);
    }
  });

  it('does not substitute identical basenames from another beatmap directory', () => {
    const selected = bytes('selected');
    const other = bytes('other');
    const files = new Map([['set-a/Audio.MP3', selected], ['set-b/audio.mp3', other]]);
    assert.equal(findArchiveEntry(files, 'audio.mp3', 'set-a/hard.osu')?.bytes, selected);
    assert.equal(findArchiveEntry(files, 'audio.mp3', 'set-b/easy.osu')?.bytes, other);
    assert.equal(findArchiveEntry(files, 'audio.mp3', 'set-c/easy.osu'), undefined);
    assert.equal(findArchiveEntry(files, 'audio.mp3'), undefined);
  });

  it('uses the declared wrapper and never borrows even a unique resource from another directory', () => {
    const selected = bytes('selected');
    const files = new Map([['wrapper/set/audio.mp3', selected]]);
    assert.equal(findArchiveEntry(files, 'audio.mp3', 'wrapper/set/hard.osu')?.bytes, selected);
    assert.equal(findArchiveEntry(files, 'audio.mp3', 'set/hard.osu'), undefined);
    assert.equal(findArchiveEntry(files, 'audio.mp3', 'root.osu'), undefined);
    files.set('second/set/audio.mp3', bytes('ambiguous'));
    assert.equal(findArchiveEntry(files, 'audio.mp3', 'set/hard.osu'), undefined);
  });

  it('loads only the selected beatmap directory shared storyboards in a stable order', () => {
    const files = new Map([
      ['set-a/z.osb', bytes('[Events]\n// z')], ['set-b/a.osb', bytes('[Events]\n// other')],
      ['SET-A/a.osb', bytes('[Events]\n// a')], ['set-a/sub/nested.osb', bytes('[Events]\n// nested')],
    ]);
    assert.deepEqual(listOsbSources(files, 'set-a/hard.osu').map(source => source.path), ['SET-A/a.osb', 'set-a/z.osb']);
  });
});

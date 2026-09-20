import { loadItemsBounded } from './engine';
import { toArrayBuffer } from './bytes';
import { findArchiveEntry, type PreviewResourceMap } from './osu-text';
import { sampleLookupNames, resolveSample, lookupSkinSound, type PendingSound } from './engine-audio/hitsoundSchedule';
import type { ExtraSample } from './engine-audio/AudioSync';
import type { StoryboardSample } from './events';

export async function loadPreviewAudio(input: {
  ctx: AudioContext; files: PreviewResourceMap; osuPath: string;
  songName: string; mode: 0 | 1 | 2 | 3; schedule: readonly PendingSound[];
  samples: readonly StoryboardSample[]; signal: AbortSignal; onWarning(message: string): void;
}): Promise<{ song: AudioBuffer | null; sounds: Map<string, AudioBuffer>; samples: ExtraSample[]; endMs: number }> {
  const { ctx, files, osuPath, signal, onWarning } = input;
  const decoded = new Map<string, AudioBuffer>();
  const requests = new Map<string, Uint8Array>();
  const aliases = new Map<string, string>();
  const add = (name: string, source = osuPath): string | undefined => {
    const entry = findArchiveEntry(files, name, source);
    if (!entry) return;
    const key = entry.path.toLowerCase();
    requests.set(key, entry.bytes);
    return key;
  };
  const songKey = input.songName ? add(input.songName) : undefined;
  if (input.songName && !songKey) onWarning('歌曲音频缺失，仍可观看谱面');
  for (const sound of input.schedule) {
    const names = sound.type === 'combobreak' || sound.type === 'spinnerbonus'
      ? ['wav', 'mp3', 'ogg'].map(ext => `${sound.type}.${ext}`)
      : sampleLookupNames(sound.type, sound.sampleSet, sound.sampleIndex, sound.customFile, input.mode);
    let found = false;
    for (const name of names) {
      const key = add(name);
      if (key) { aliases.set(name.replace(/\\/g, '/').toLowerCase(), key); found = true; }
    }
    if (!found && sound.customFile && sound.customFile !== 'catch-banana') onWarning('部分谱面音效缺失，已使用内置音效');
  }
  const sampleKeys = input.samples.map(sample => add(sample.file, ''));
  if (sampleKeys.some(key => !key)) onWarning('部分故事板音效缺失，已保留其它谱面内容');
  await loadItemsBounded({
    items: [...requests], concurrency: 3, signal, failureMode: 'throw',
    load: async ([path, bytes]) => {
      try {
        const buffer = await ctx.decodeAudioData(toArrayBuffer(bytes));
        if (!signal.aborted) decoded.set(path, buffer);
      } catch { if (!signal.aborted) onWarning(path === songKey ? '歌曲音频无法播放，仍可观看谱面' : '部分音效无法播放，已保留其它谱面内容'); }
    },
  });
  signal.throwIfAborted();
  const sounds = new Map<string, AudioBuffer>();
  aliases.forEach((path, name) => { const buffer = decoded.get(path); if (buffer) sounds.set(name, buffer); });
  const samples: ExtraSample[] = [];
  let endMs = 0;
  input.samples.forEach((sample, i) => {
    const key = sampleKeys[i];
    const buffer = key ? decoded.get(key) : undefined;
    if (!buffer) return;
    endMs = Math.max(endMs, sample.timeMs + buffer.duration * 1000);
    if (sample.layer !== 'Fail') samples.push({ timeMs: sample.timeMs, volume: sample.volume, buffer });
  });
  const deps = { mode: input.mode, skinSounds: sounds, lazerDefaultSounds: null, synthCache: new Map<string, AudioBuffer>(), ctx };
  for (const sound of input.schedule) {
    const buffer = sound.type === 'combobreak' || sound.type === 'spinnerbonus'
      ? lookupSkinSound(sounds, sound.type)
      : resolveSample(sound.type, sound.sampleSet, sound.sampleIndex, sound.customFile, deps);
    if (buffer) endMs = Math.max(endMs, sound.beatmapMs + buffer.duration * 1000);
  }
  return { song: songKey ? decoded.get(songKey) ?? null : null, sounds, samples, endMs };
}

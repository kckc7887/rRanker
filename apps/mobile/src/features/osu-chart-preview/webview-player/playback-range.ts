import { slideDurationMs, type BeatmapData } from './engine';

export type PlaybackRange = { startMs: number; endMs: number; durationMs: number };

export function resolvePlaybackRange(
  beatmap: BeatmapData,
  songDurationMs: number | null,
  media: { startMs: number; endMs: number },
  soundEndMs = 0,
): PlaybackRange {
  let lastNoteMs = 0;
  for (const object of beatmap.hitObjects) {
    const end = object.type === 'spinner' ? object.endTime
      : object.type === 'slider' ? object.time + slideDurationMs(beatmap, object) * object.slides : object.time;
    lastNoteMs = Math.max(lastNoteMs, end);
  }
  for (const hold of beatmap.maniaHolds) lastNoteMs = Math.max(lastNoteMs, hold.endTime);
  const startMs = Math.min(0, media.startMs, -Math.max(0, beatmap.audioLeadIn));
  /** 末尾保留松键和反馈时间，静音谱面也适用。 */
  const endMs = Math.max(lastNoteMs + 1000, songDurationMs ?? 0, media.endMs, soundEndMs, 1000);
  return { startMs, endMs, durationMs: endMs - startMs };
}

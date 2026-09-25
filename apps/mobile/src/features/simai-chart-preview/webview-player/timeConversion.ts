import { TimingTimeline, type BpmEvent, type Chart } from '../engine';

let cachedBpmEvents: readonly BpmEvent[] | null = null;
let cachedDefaultBpm = Number.NaN;
let cachedTimeline: TimingTimeline | null = null;

function getTimingTimeline(
  bpmEvents: readonly BpmEvent[] | null,
  defaultBpm: number,
): TimingTimeline {
  if (cachedTimeline && cachedBpmEvents === bpmEvents && cachedDefaultBpm === defaultBpm) {
    return cachedTimeline;
  }
  cachedBpmEvents = bpmEvents;
  cachedDefaultBpm = defaultBpm;
  cachedTimeline = new TimingTimeline(defaultBpm, bpmEvents);
  return cachedTimeline;
}

const LEAD_IN_BEATS = 4;

export function getLeadInMs(bpm: number): number {
  return (60000 * LEAD_IN_BEATS) / bpm;
}

export function beatsToMs(
  beats: number,
  bpmEvents: readonly BpmEvent[] | null,
  defaultBpm: number,
): number {
  return getTimingTimeline(bpmEvents, defaultBpm).msFromBeat(beats);
}

export function msToBeats(
  ms: number,
  bpmEvents: readonly BpmEvent[] | null,
  defaultBpm: number,
): number {
  return getTimingTimeline(bpmEvents, defaultBpm).beatFromMs(ms);
}

export function calculateMusicTime(
  preciseTime: number,
  bpmEvents: readonly BpmEvent[] | null,
  bpm: number,
  musicOffset: number,
  firstMs: number = 0,
): number {
  const chartTimeMs = beatsToMs(preciseTime, bpmEvents, bpm);
  const leadInMs = getLeadInMs(bpm);
  return (chartTimeMs - leadInMs - musicOffset + firstMs) / 1000;
}

export function musicTimeToBeats(
  musicTimeSec: number,
  bpmEvents: readonly BpmEvent[] | null,
  bpm: number,
  musicOffset: number,
  firstMs: number = 0,
): number {
  const leadInMs = getLeadInMs(bpm);
  const chartTimeMs = musicTimeSec * 1000 + leadInMs + musicOffset - firstMs;
  return msToBeats(chartTimeMs, bpmEvents, bpm);
}

export function resolvePlaybackRange(
  charts: readonly Chart[],
  musicDurationSeconds: number | null,
  musicOffset: number = 0,
): { totalDurationMs: number; totalBeats: number } {
  const chart = charts[0]!;
  const leadInMs = getLeadInMs(chart.bpm);
  let totalDurationMs = leadInMs;
  for (const side of charts) {
    totalDurationMs = Math.max(totalDurationMs, side.durationMs + leadInMs - getLeadInMs(side.bpm));
  }
  if (musicDurationSeconds !== null) {
    const musicEndBeats = musicTimeToBeats(
      musicDurationSeconds, chart.bpmEvents, chart.bpm, musicOffset, chart.firstMs,
    );
    totalDurationMs = Math.max(totalDurationMs, beatsToMs(musicEndBeats, chart.bpmEvents, chart.bpm));
  }
  return {
    totalDurationMs,
    totalBeats: msToBeats(totalDurationMs, chart.bpmEvents, chart.bpm),
  };
}

/** 谱面确认预览曲的固定音乐偏移（秒）；播放、范围与背景视频共用同一值。 */
export const SIMAI_PREVIEW_MUSIC_OFFSET_SECONDS = 0;

/**
 * 播放位置（拍）与毫秒、音乐秒之间的换算给同一份主谱时间轴使用。
 * 会话与视图共用该对象的实例，不各自换算。
 */
export interface SimaiPlaybackTimeline {
  readonly totalBeats: number;
  /** 拍 → 谱面毫秒。 */
  beatsToMs(beats: number): number;
  /** 谱面毫秒 → 拍。 */
  beatsAtMs(ms: number): number;
  /** 拍 → 音乐秒数。 */
  musicSecondsAt(beats: number): number;
  /** 音乐秒数 → 拍。 */
  beatsAtMusicSeconds(seconds: number): number;
}

export function createSimaiPlaybackTimeline(
  chart: Chart,
  totalBeats: number,
  musicOffset: number = SIMAI_PREVIEW_MUSIC_OFFSET_SECONDS,
): SimaiPlaybackTimeline {
  const bpmEvents = chart.bpmEvents;
  const bpm = chart.bpm;
  const firstMs = chart.firstMs ?? 0;
  return {
    totalBeats,
    beatsToMs: (beats) => beatsToMs(beats, bpmEvents, bpm),
    beatsAtMs: (ms) => msToBeats(ms, bpmEvents, bpm),
    musicSecondsAt: (beats) => calculateMusicTime(beats, bpmEvents, bpm, musicOffset, firstMs),
    beatsAtMusicSeconds: (seconds) => musicTimeToBeats(seconds, bpmEvents, bpm, musicOffset, firstMs),
  };
}

export type BackgroundVideoFrame = {
  active: boolean;
  targetSeconds: number;
};

export function resolveBackgroundVideoFrame(input: {
  currentBeats: number;
  totalBeats: number;
  isPlaying: boolean;
  durationSeconds: number;
  bpmEvents: readonly BpmEvent[] | null;
  bpm: number;
  musicOffset: number;
  firstMs?: number;
}): BackgroundVideoFrame {
  const targetSeconds = calculateMusicTime(
    input.currentBeats,
    input.bpmEvents,
    input.bpm,
    input.musicOffset,
    input.firstMs,
  );
  const stoppedAtEnd = !input.isPlaying && input.currentBeats >= input.totalBeats;
  const beforeVideoEnd = !Number.isFinite(input.durationSeconds)
    || targetSeconds < input.durationSeconds;
  return {
    active: targetSeconds > 0 && !stoppedAtEnd && beforeVideoEnd,
    targetSeconds,
  };
}

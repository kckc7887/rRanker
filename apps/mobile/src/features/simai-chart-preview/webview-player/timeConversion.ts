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

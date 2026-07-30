import { TimingTimeline, type BpmEvent } from '../engine';

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

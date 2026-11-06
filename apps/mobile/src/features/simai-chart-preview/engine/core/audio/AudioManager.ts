import { Note, AudioConfig } from "../../types";
import { ANSWER_SOUND_BASE_OFFSET_MS } from "../../utils/constants";
import { lowerBoundBy } from "../../../../chart-preview-shared/webview-player/sorted-search";
import { getAudioContextOutputTime } from "../../../../chart-preview-shared/webview-player/audioClock";

const SCHEDULE_LOOKAHEAD_MS = 1500;
/** 待播源达到上限后由后续帧续排。 */
const MAX_PENDING_SOURCES = 96;
/** 密集段最大间隔，单位为毫秒。 */
const DENSE_GAP_MS = 40;
const MIN_TICK_TAIL_MS = 30;
/** 密集段合并成一个 AudioBuffer，减少同时挂载的音源。 */
const MIN_RUN_EVENTS = 16;
const RUN_LENGTH_MS = 2000;
const CACHED_RUNS = 8;

export interface AudioManagerConfig {
  audioContext: AudioContext;
  outputNode: AudioNode;
  answerSoundPath?: string;
  initialVolume?: number;
  initialTimingOffset?: number;
}

interface ScheduledSourceEntry {
  source: AudioBufferSourceNode;
  startTime: number;
  stopAt?: number;
  /** 长烘焙段清理时必须停止，避免与重排的段重叠。 */
  stopOnClear?: boolean;
}

interface DenseRun {
  startMs: number;
  endMs: number;
  first: number;
  last: number;
}

interface PreprocessedEvents {
  epoch: number;
  singles: PreparedAudioEvent[];
  runs: DenseRun[];
}

export interface PreparedAudioEvent {
  timeMs: number;
  hasBaseSound: boolean;
  hasTouchSound: boolean;
  hasHoldEndSound: boolean;
  hasTouchHoldEndSound: boolean;
}

export function decodeBase64AudioDataUrl(value: string): ArrayBuffer | null {
  const match = /^data:audio\/[^;,]+;base64,([a-z\d+/=]+)$/i.exec(value);
  if (!match) return null;

  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export function prepareAudioEvents(notes: readonly Note[] | null): PreparedAudioEvent[] {
  const events: PreparedAudioEvent[] = [];
  const push = (timeMs: number, kind: keyof Pick<PreparedAudioEvent, 'hasBaseSound' | 'hasTouchSound' | 'hasHoldEndSound' | 'hasTouchHoldEndSound'>) => {
    events.push({ timeMs, hasBaseSound: false, hasTouchSound: false, hasHoldEndSound: false, hasTouchHoldEndSound: false, [kind]: true });
  };
  for (const note of notes ?? []) {
    if (note.type === 'slide' && note.isHeadless) continue;
    push(note.timingMs, note.type === 'touch' || note.type === 'touch-hold-start' ? 'hasTouchSound' : 'hasBaseSound');
    if (note.type === 'hold-start' || note.type === 'touch-hold-start') push(note.endTimeMs, note.type === 'hold-start' ? 'hasHoldEndSound' : 'hasTouchHoldEndSound');
  }
  events.sort((a, b) => a.timeMs - b.timeMs);
  const merged: PreparedAudioEvent[] = [];
  for (const event of events) {
    const previous = merged[merged.length - 1];
    if (previous && event.timeMs - previous.timeMs <= 1) {
      previous.hasBaseSound ||= event.hasBaseSound; previous.hasTouchSound ||= event.hasTouchSound;
      previous.hasHoldEndSound ||= event.hasHoldEndSound; previous.hasTouchHoldEndSound ||= event.hasTouchHoldEndSound;
    } else merged.push(event);
  }
  return merged;
}

export class AudioManager {
  private audioContext: AudioContext;
  private outputNode: AudioNode;
  private answerBuffer: AudioBuffer | null = null;
  private initialized = false;

  private enabled = false;
  private holdEndSoundEnabled = true;
  private touchSoundEnabled = true;
  private volume = 0.5;
  private timingOffsetMs = ANSWER_SOUND_BASE_OFFSET_MS;

  private nextRun: number | null = null;
  private baked = new Map<DenseRun, AudioBuffer>();
  private nextSingle: number | null = null;
  private scheduledSources = new Set<ScheduledSourceEntry>();
  private preprocessedCache = new WeakMap<readonly PreparedAudioEvent[], PreprocessedEvents>();
  /** 开关变化使烘焙缓存失效。 */
  private toggleEpoch = 0;

  private lastScheduledTimeMs = -Infinity;

  private answerSoundPath: string;
  private answerGainNode: GainNode;

  constructor(config: AudioManagerConfig) {
    this.audioContext = config.audioContext;
    this.outputNode = config.outputNode;
    this.answerSoundPath = config.answerSoundPath ?? "/assets/maimai/chart/answer.wav";
    this.volume = config.initialVolume ?? 0.5;
    this.timingOffsetMs = config.initialTimingOffset ?? ANSWER_SOUND_BASE_OFFSET_MS;
    this.answerGainNode = this.audioContext.createGain();
    this.answerGainNode.gain.value = this.volume;
    this.answerGainNode.connect(this.outputNode);
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const embeddedAudio = decodeBase64AudioDataUrl(this.answerSoundPath);
      const arrayBuffer = embeddedAudio ?? await (await fetch(this.answerSoundPath)).arrayBuffer();
      this.answerBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.initialized = true;
    } catch (error) {
      console.error("AudioManager: Failed to initialize", error);
    }
  }

  dispose(): void {
    this.clearScheduledSources(true);
    this.answerBuffer = null;
    this.initialized = false;
    this.nextRun = null;
    this.baked.clear();
  }

  private playAnswerSoundAt(when: number, stopAfterMs: number = 0): void {
    if (!this.enabled || !this.answerBuffer) return;

    try {
      const source = this.audioContext.createBufferSource();
      const entry: ScheduledSourceEntry = {
        source,
        startTime: when > 0 ? when : this.audioContext.currentTime,
      };

      source.buffer = this.answerBuffer;

      source.connect(this.answerGainNode);
      this.scheduledSources.add(entry);
      source.start(when);
      if (stopAfterMs > 0) {
        entry.stopAt = entry.startTime + stopAfterMs / 1000;
        source.stop(entry.stopAt);
      }

      source.onended = () => {
        this.scheduledSources.delete(entry);

        try {
          source.disconnect();
        } catch {
        }
      };
    } catch (error) {
      console.error("AudioManager: Playback error", error);
    }
  }

  private getPreprocessed(events: readonly PreparedAudioEvent[]): PreprocessedEvents {
    const cached = this.preprocessedCache.get(events);
    if (cached && cached.epoch === this.toggleEpoch) return cached;

    const singles: PreparedAudioEvent[] = [];
    const runs: DenseRun[] = [];
    let i = 0;
    while (i < events.length) {
      let j = i;
      while (j + 1 < events.length && events[j + 1].timeMs - events[j].timeMs <= DENSE_GAP_MS) j++;
      if (j - i + 1 >= MIN_RUN_EVENTS) {
        let first = i;
        while (first <= j) {
          let last = first;
          while (last < j && events[last + 1].timeMs - events[first].timeMs < RUN_LENGTH_MS) last++;
          runs.push({ startMs: events[first].timeMs, endMs: events[last].timeMs, first, last });
          first = last + 1;
        }
      } else {
        for (let k = i; k <= j; k++) singles.push(events[k]);
      }
      i = j + 1;
    }

    const result: PreprocessedEvents = { epoch: this.toggleEpoch, singles, runs };
    this.preprocessedCache.set(events, result);
    return result;
  }

  private bakeRun(events: readonly PreparedAudioEvent[], run: DenseRun): AudioBuffer {
    const cached = this.baked.get(run);
    if (cached) return cached;
    const tickBuffer = this.answerBuffer!;
    const { first: from, last: to, startMs, endMs } = run;
    const sampleRate = tickBuffer.sampleRate;
    const length = Math.ceil(((endMs - startMs) / 1000) * sampleRate) + tickBuffer.length;
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const out = buffer.getChannelData(0);
    const tick = tickBuffer.getChannelData(0);

    for (let k = from; k <= to; k++) {
      const event = events[k];
      if (!this.shouldPlaySound(event)) continue;
      const offset = Math.round(((event.timeMs - startMs) / 1000) * sampleRate);
      const limit = Math.min(tick.length, length - offset);
      for (let s = 0; s < limit; s++) out[offset + s] += tick[s];
    }

    if (this.baked.size >= CACHED_RUNS) this.baked.delete(this.baked.keys().next().value!);
    this.baked.set(run, buffer);
    return buffer;
  }

  private playRunAt(buffer: AudioBuffer, when: number, offsetSec: number, playbackRate: number, stop: number): void {
    if (!this.enabled) return;

    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playbackRate;
      const entry: ScheduledSourceEntry = {
        source,
        startTime: when > 0 ? when : this.audioContext.currentTime,
        stopOnClear: true,
      };

      source.connect(this.answerGainNode);
      this.scheduledSources.add(entry);
      source.start(when, offsetSec);
      if (Number.isFinite(stop)) {
        entry.stopAt = stop;
        source.stop(stop);
      }

      source.onended = () => {
        this.scheduledSources.delete(entry);

        try {
          source.disconnect();
        } catch {
        }
      };
    } catch (error) {
      console.error("AudioManager: Run playback error", error);
    }
  }

  private shouldPlaySound(event: PreparedAudioEvent): boolean {
    return (
      event.hasBaseSound ||
      (this.touchSoundEnabled && event.hasTouchSound) ||
      (this.holdEndSoundEnabled && event.hasHoldEndSound) ||
      (this.touchSoundEnabled && this.holdEndSoundEnabled && event.hasTouchHoldEndSound)
    );
  }

  schedule(
    events: readonly PreparedAudioEvent[],
    currentTimeMs: number,
    playbackSpeed: number = 1,
    lookAheadMs: number = SCHEDULE_LOOKAHEAD_MS,
    precomputedOutputTime?: number,
    endMs = Infinity,
  ): void {
    if (!this.enabled || events.length === 0 || !this.answerBuffer) return;

    const normalizedPlaybackSpeed = Math.max(playbackSpeed, 0.001);

    const adjustedCurrentTime = currentTimeMs - this.timingOffsetMs;
    const adjustedLastTime = this.lastScheduledTimeMs - this.timingOffsetMs;
    const adjustedLookAheadTime = adjustedCurrentTime + lookAheadMs;
    const currentContextTime = this.audioContext.currentTime;
    const outputTime = precomputedOutputTime ?? getAudioContextOutputTime(this.audioContext);

    const { singles, runs } = this.getPreprocessed(events);

    this.nextRun ??= lowerBoundBy(runs, adjustedCurrentTime - this.answerBuffer.duration * 1000, run => run.endMs);
    const stop = outputTime + (endMs - currentTimeMs) / (1000 * normalizedPlaybackSpeed);
    while (this.nextRun < runs.length && stop > currentContextTime) {
      const run = runs[this.nextRun]!;
      if (run.startMs > adjustedLookAheadTime || run.startMs + this.timingOffsetMs >= endMs) break;
      this.nextRun++;
      if (run.endMs + this.answerBuffer.duration * 1000 <= adjustedCurrentTime) continue;
      const offset = (adjustedCurrentTime - run.startMs) / 1000;
      const buffer = this.bakeRun(events, run);
      const when = Math.max(currentContextTime, outputTime + Math.max(0, -offset) / normalizedPlaybackSpeed);
      this.playRunAt(buffer, when, Math.max(0, offset), normalizedPlaybackSpeed, stop);
    }

    this.nextSingle ??= lowerBoundBy(singles, adjustedLastTime, event => event.timeMs);
    while (this.nextSingle < singles.length && this.scheduledSources.size < MAX_PENDING_SOURCES) {
      const i = this.nextSingle;
      const event = singles[i]!;
      const noteTime = event.timeMs;
      if (noteTime > adjustedLookAheadTime || noteTime + this.timingOffsetMs >= endMs) break;
      this.nextSingle++;
      if (!this.shouldPlaySound(event)) continue;

      const gapMs = i + 1 < singles.length ? singles[i + 1].timeMs - noteTime : Infinity;
      const stopAfterMs =
        gapMs < DENSE_GAP_MS ? Math.max(gapMs * 3, MIN_TICK_TAIL_MS) / normalizedPlaybackSpeed : 0;

      if (noteTime < adjustedLastTime) continue;
      const delayMs = noteTime - adjustedCurrentTime;
      const when = Math.max(
        currentContextTime,
        outputTime + delayMs / 1000 / normalizedPlaybackSpeed,
      );
      this.playAnswerSoundAt(when, stopAfterMs);
    }

    this.lastScheduledTimeMs = currentTimeMs;
  }

  reset(currentTimeMs?: number, stopStartedSources: boolean = false): void {
    this.clearScheduledSources(stopStartedSources);
    this.moveCursor(currentTimeMs);
  }

  rewind(currentTimeMs: number, when: number): void {
    for (const entry of this.scheduledSources) {
      if ((entry.stopAt ?? Infinity) <= when) continue;
      entry.stopAt = when;
      entry.source.stop(when);
    }
    this.moveCursor(currentTimeMs);
  }

  private moveCursor(currentTimeMs?: number): void {
    this.nextRun = null;
    this.nextSingle = null;
    this.lastScheduledTimeMs = currentTimeMs ?? -Infinity;
  }

  setEnabled(enabled: boolean): void {
    if (!enabled) this.reset(this.lastScheduledTimeMs, true);
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** 开关变化后停止旧烘焙段，重新生成并调度。 */
  private invalidateBakedRuns(): void {
    for (const entry of this.scheduledSources) {
      if (!entry.stopOnClear) continue;
      try {
        entry.source.stop();
      } catch {
      }
      this.scheduledSources.delete(entry);
    }
    this.nextRun = null;
    this.baked.clear();
  }

  setHoldEndSoundEnabled(enabled: boolean): void {
    if (enabled !== this.holdEndSoundEnabled) {
      this.toggleEpoch++;
      this.invalidateBakedRuns();
    }
    this.holdEndSoundEnabled = enabled;
  }

  isHoldEndSoundEnabled(): boolean {
    return this.holdEndSoundEnabled;
  }

  setTouchSoundEnabled(enabled: boolean): void {
    if (enabled !== this.touchSoundEnabled) {
      this.toggleEpoch++;
      this.invalidateBakedRuns();
    }
    this.touchSoundEnabled = enabled;
  }

  isTouchSoundEnabled(): boolean {
    return this.touchSoundEnabled;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.answerGainNode.gain.value = this.volume;
  }

  getVolume(): number {
    return this.volume;
  }

  setTimingOffset(offsetMs: number): void {
    this.timingOffsetMs = offsetMs;
  }

  getTimingOffset(): number {
    return this.timingOffsetMs;
  }

  getConfig(): AudioConfig {
    return {
      enabled: this.enabled,
      holdEndSoundEnabled: this.holdEndSoundEnabled,
      touchSoundEnabled: this.touchSoundEnabled,
      volume: this.volume,
      timingOffsetMs: this.timingOffsetMs,
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private clearScheduledSources(stopStartedSources: boolean = false): void {
    const now = this.audioContext.currentTime;

    for (const entry of this.scheduledSources) {
      if (!stopStartedSources && !entry.stopOnClear && entry.startTime <= now) {
        continue;
      }

      try {
        entry.source.stop();
      } catch {
      }

      try {
        entry.source.disconnect();
      } catch {
      }

      this.scheduledSources.delete(entry);
    }
  }
}

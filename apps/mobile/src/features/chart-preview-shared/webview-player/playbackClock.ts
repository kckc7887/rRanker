/**
 * 播放分段时钟（谱面确认 WebView 播放器公共层）：
 * 分段起点是 AudioContext 时间，查询可以是 AudioContext 时间或输出端时间，
 * 返回值是音乐位置。新速度段从生效时刻的音乐位置连续接上。
 */

declare const audioContextTimeBrand: unique symbol;
declare const outputTimeBrand: unique symbol;
declare const musicPositionBrand: unique symbol;

/** AudioContext.currentTime 轴上的时刻，用于音源调度和速度生效点。 */
export type AudioContextTime = number & { readonly [audioContextTimeBrand]: never };
/** 已到达输出端的 AudioContext 时刻，用于视觉位置。 */
export type OutputTime = number & { readonly [outputTimeBrand]: never };
/** 音乐/谱面时间轴上的位置。 */
export type MusicPosition = number & { readonly [musicPositionBrand]: never };

export function audioContextTime(seconds: number): AudioContextTime {
  return seconds as AudioContextTime;
}

export function outputTime(seconds: number): OutputTime {
  return seconds as OutputTime;
}

export function musicPosition(seconds: number): MusicPosition {
  return seconds as MusicPosition;
}

interface PlaybackClockSegment {
  startTime: number;
  startOffset: number;
  playbackSpeed: number;
}

function findClockSegmentIndex(
  segments: readonly PlaybackClockSegment[],
  contextTime: number,
): number {
  let index = 0;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i]!.startTime > contextTime) break;
    index = i;
  }
  return index;
}

export class PlaybackClock {
  private startOffset = 0;
  private segments: PlaybackClockSegment[] = [];

  get offset(): MusicPosition {
    return musicPosition(this.startOffset);
  }

  setOffset(offset: MusicPosition): void {
    this.startOffset = offset;
    this.segments = [];
  }

  clear(): void {
    this.segments = [];
  }

  set(startTime: AudioContextTime | OutputTime, startOffset: MusicPosition, playbackSpeed: number): void {
    this.startOffset = startOffset;
    this.segments = [{ startTime, startOffset, playbackSpeed }];
  }

  positionAt(time: AudioContextTime | OutputTime): MusicPosition {
    if (this.segments.length === 0) return musicPosition(this.startOffset);
    const segment = this.segments[findClockSegmentIndex(this.segments, time)]!;
    const elapsed = Math.max(0, time - segment.startTime);
    return musicPosition(segment.startOffset + elapsed * segment.playbackSpeed);
  }

  schedulingSpeed(fallbackSpeed: number): number {
    if (this.segments.length === 0) return fallbackSpeed;
    return this.segments[this.segments.length - 1]!.playbackSpeed;
  }

  prune(time: AudioContextTime | OutputTime): void {
    const index = findClockSegmentIndex(this.segments, time);
    if (index > 0) this.segments = this.segments.slice(index);
  }

  /** 速度从 startTime 这个 AudioContext 时刻生效，音乐位置按该时刻连续接上。 */
  appendSegment(startTime: AudioContextTime, playbackSpeed: number): void {
    const firstSegment = this.segments[0];
    if (!firstSegment) {
      this.set(startTime, this.offset, playbackSpeed);
      return;
    }
    if (startTime <= firstSegment.startTime) {
      this.startOffset = firstSegment.startOffset;
      this.segments = [{ ...firstSegment, playbackSpeed }];
      return;
    }
    const currentOffset = this.positionAt(startTime);
    this.segments.push({ startTime, startOffset: currentOffset, playbackSpeed });
  }
}

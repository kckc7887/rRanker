declare const audioContextTimeBrand: unique symbol;
declare const outputTimeBrand: unique symbol;
declare const musicPositionBrand: unique symbol;

export type AudioContextTime = number & { readonly [audioContextTimeBrand]: never };

export type OutputTime = number & { readonly [outputTimeBrand]: never };

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

  /** 速度切换以 AudioContext 时间接续音乐位置。 */
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

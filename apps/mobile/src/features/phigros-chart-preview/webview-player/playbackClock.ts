/**
 * 播放分段时钟，移植自舞萌谱面确认 webview-player/playbackClock.ts：
 * 以 AudioContext 输出端时间为横轴记录播放起止与倍速变化，
 * 任意时刻都能反查精确的音乐位置，pause/seek/倍速变化不丢样本。
 */

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

  get offset(): number {
    return this.startOffset;
  }

  setOffset(offset: number): void {
    this.startOffset = offset;
    this.segments = [];
  }

  clear(): void {
    this.segments = [];
  }

  set(startTime: number, startOffset: number, playbackSpeed: number): void {
    this.startOffset = startOffset;
    this.segments = [{ startTime, startOffset, playbackSpeed }];
  }

  positionAt(contextTime: number): number {
    if (this.segments.length === 0) return this.startOffset;
    const segment = this.segments[findClockSegmentIndex(this.segments, contextTime)]!;
    const elapsed = Math.max(0, contextTime - segment.startTime);
    return segment.startOffset + elapsed * segment.playbackSpeed;
  }

  schedulingSpeed(fallbackSpeed: number): number {
    if (this.segments.length === 0) return fallbackSpeed;
    return this.segments[this.segments.length - 1]!.playbackSpeed;
  }

  prune(contextTime: number): void {
    const index = findClockSegmentIndex(this.segments, contextTime);
    if (index > 0) this.segments = this.segments.slice(index);
  }

  appendSegment(startTime: number, playbackSpeed: number, visibleContextTime: number): void {
    const firstSegment = this.segments[0];
    if (!firstSegment) {
      this.set(startTime, this.startOffset, playbackSpeed);
      return;
    }
    if (startTime <= firstSegment.startTime) {
      this.startOffset = firstSegment.startOffset;
      this.segments = [{ ...firstSegment, playbackSpeed }];
      return;
    }
    const currentOffset = this.positionAt(visibleContextTime);
    this.segments.push({ startTime, startOffset: currentOffset, playbackSpeed });
  }
}

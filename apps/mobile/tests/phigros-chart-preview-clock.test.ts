import { describe, expect, it } from 'vitest';
import { PlaybackClock } from '@/features/phigros-chart-preview/webview-player/playbackClock';

describe('phigros chart preview playback clock（移植舞萌分段时钟）', () => {
  it('静止时返回 setOffset 保存的位置', () => {
    const clock = new PlaybackClock();
    clock.setOffset(7.5);
    expect(clock.offset).toBe(7.5);
    expect(clock.positionAt(100)).toBe(7.5);
  });

  it('播放段按输出端时间线性推进并支持倍速', () => {
    const clock = new PlaybackClock();
    clock.set(10, 5, 2);
    expect(clock.positionAt(10)).toBe(5);
    expect(clock.positionAt(11)).toBe(7);
    expect(clock.positionAt(9)).toBe(5);
  });

  it('倍速变化时 appendSegment 从当前可见位置续接', () => {
    const clock = new PlaybackClock();
    clock.set(0, 0, 1);
    expect(clock.positionAt(2)).toBe(2);
    clock.appendSegment(2, 2, 2);
    expect(clock.positionAt(3)).toBe(4);
    expect(clock.schedulingSpeed(1)).toBe(2);
  });

  it('appendSegment 起点早于首段时只替换倍速', () => {
    const clock = new PlaybackClock();
    clock.set(5, 2, 1);
    clock.appendSegment(3, 3, 0);
    expect(clock.offset).toBe(2);
    expect(clock.positionAt(6)).toBe(2 + 1 * 3);
    expect(clock.schedulingSpeed(1)).toBe(3);
  });

  it('prune 只保留当前段及其后的历史，位置不受影响', () => {
    const clock = new PlaybackClock();
    clock.set(0, 0, 1);
    clock.appendSegment(2, 2, 2);
    clock.appendSegment(4, 0.5, 4);
    const before = clock.positionAt(6);
    clock.prune(5);
    expect(clock.positionAt(6)).toBe(before);
  });

  it('pause 场景：setOffset 后位置冻结，clear 仅清段不清偏移', () => {
    const clock = new PlaybackClock();
    clock.set(0, 0, 1);
    const paused = clock.positionAt(3);
    clock.setOffset(paused);
    clock.clear();
    expect(clock.offset).toBe(3);
    expect(clock.positionAt(100)).toBe(3);
  });
});

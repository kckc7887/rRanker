import { describe, expect, it } from 'vitest';
import {
  PlaybackClock,
  audioContextTime,
  musicPosition,
  outputTime,
} from '@/features/chart-preview-shared/webview-player/playbackClock';

describe('phigros chart preview playback clock（移植舞萌分段时钟）', () => {
  it('静止时返回 setOffset 保存的位置', () => {
    const clock = new PlaybackClock();
    clock.setOffset(musicPosition(7.5));
    expect(clock.offset).toBe(7.5);
    expect(clock.positionAt(audioContextTime(100))).toBe(7.5);
  });

  it('播放段按输出端时间线性推进并支持倍速', () => {
    const clock = new PlaybackClock();
    clock.set(audioContextTime(10), musicPosition(5), 2);
    expect(clock.positionAt(audioContextTime(10))).toBe(5);
    expect(clock.positionAt(audioContextTime(11))).toBe(7);
    expect(clock.positionAt(audioContextTime(9))).toBe(5);
  });

  it('倍速变化时 appendSegment 从当前可见位置续接', () => {
    const clock = new PlaybackClock();
    clock.set(audioContextTime(0), musicPosition(0), 1);
    expect(clock.positionAt(audioContextTime(2))).toBe(2);
    clock.appendSegment(audioContextTime(2), 2);
    expect(clock.positionAt(audioContextTime(3))).toBe(4);
    expect(clock.schedulingSpeed(1)).toBe(2);
  });

  it('appendSegment 起点早于首段时只替换倍速', () => {
    const clock = new PlaybackClock();
    clock.set(audioContextTime(5), musicPosition(2), 1);
    clock.appendSegment(audioContextTime(3), 3);
    expect(clock.offset).toBe(2);
    expect(clock.positionAt(audioContextTime(6))).toBe(2 + 1 * 3);
    expect(clock.schedulingSpeed(1)).toBe(3);
  });

  it('prune 只保留当前段及其后的历史，位置不受影响', () => {
    const clock = new PlaybackClock();
    clock.set(audioContextTime(0), musicPosition(0), 1);
    clock.appendSegment(audioContextTime(2), 2);
    clock.appendSegment(audioContextTime(4), 0.5);
    const before = clock.positionAt(audioContextTime(6));
    clock.prune(audioContextTime(5));
    expect(clock.positionAt(audioContextTime(6))).toBe(before);
  });

  it('pause 场景：setOffset 后位置冻结，clear 仅清段不清偏移', () => {
    const clock = new PlaybackClock();
    clock.set(audioContextTime(0), musicPosition(0), 1);
    const paused = clock.positionAt(audioContextTime(3));
    clock.setOffset(paused);
    clock.clear();
    expect(clock.offset).toBe(3);
    expect(clock.positionAt(audioContextTime(100))).toBe(3);
  });

  it('新速度段从 AudioContext 生效时刻连续接上，输出端滞后不会倒退', () => {
    const clock = new PlaybackClock();
    clock.set(audioContextTime(0), musicPosition(0), 1);
    const change = audioContextTime(9.999);
    expect(clock.positionAt(change)).toBeCloseTo(9.999);
    clock.appendSegment(change, 2);
    expect(clock.positionAt(outputTime(9.9))).toBeCloseTo(9.9);
    expect(clock.positionAt(change)).toBeCloseTo(9.999);
    expect(clock.positionAt(audioContextTime(10.999))).toBeCloseTo(9.999 + 2);
  });

  it('从音乐位置 60 在 AudioContext 10 开播，15 变速时连续位置约为 65', () => {
    const clock = new PlaybackClock();
    clock.set(audioContextTime(10), musicPosition(60), 1);
    clock.appendSegment(audioContextTime(15), 1.5);
    expect(clock.positionAt(audioContextTime(15))).toBeCloseTo(65);
    expect(clock.positionAt(audioContextTime(17))).toBeCloseTo(65 + 2 * 1.5);
  });

  it('变速后位置单调，并等于各段速度积分', () => {
    const clock = new PlaybackClock();
    clock.set(audioContextTime(0), musicPosition(0), 1);
    clock.appendSegment(audioContextTime(4), 2);
    clock.appendSegment(audioContextTime(6), 0.5);
    const samples = [0, 2, 4, 5, 6, 10];
    const expected = [0, 2, 4, 6, 8, 10];
    let previous = -Infinity;
    samples.forEach((time, index) => {
      const position = clock.positionAt(audioContextTime(time));
      expect(position).toBeCloseTo(expected[index]!);
      expect(position).toBeGreaterThanOrEqual(previous);
      previous = position;
    });
  });

  it('seek 之后 0.5x、2x、1x 都从 seek 位置积分', () => {
    const clock = new PlaybackClock();
    clock.set(audioContextTime(0), musicPosition(0), 1);
    clock.setOffset(musicPosition(40));
    clock.set(audioContextTime(100), musicPosition(40), 0.5);
    expect(clock.positionAt(audioContextTime(104))).toBeCloseTo(42);
    clock.appendSegment(audioContextTime(104), 2);
    expect(clock.positionAt(audioContextTime(104))).toBeCloseTo(42);
    expect(clock.positionAt(audioContextTime(105))).toBeCloseTo(44);
    clock.appendSegment(audioContextTime(106), 1);
    expect(clock.positionAt(audioContextTime(106))).toBeCloseTo(46);
    expect(clock.positionAt(audioContextTime(108))).toBeCloseTo(48);
  });
});

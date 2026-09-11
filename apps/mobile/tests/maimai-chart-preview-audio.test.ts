import { describe, expect, it } from 'vitest';
import { decodeBase64AudioDataUrl } from '@/features/simai-chart-preview/engine/core/audio/AudioManager';
import { parseSimaiBuddyCharts, parseSimaiChart } from '@/features/simai-chart-preview/engine/core/parser/SimaiParser';
import {
  beatsToMs,
  calculateMusicTime,
  resolveBackgroundVideoFrame,
  resolvePlaybackRange,
} from '@/features/simai-chart-preview/webview-player/timeConversion';

describe('resolvePlaybackRange', () => {
  it('keeps a 161-second song playable after its chart ends at music time 156', () => {
    const chart = parseSimaiChart(`&inote_5=(120){4}${'1,'.repeat(308)}`, 5);
    const range = resolvePlaybackRange([chart], 161);
    expect(chart.durationMs).toBe(158000);
    expect(range.totalDurationMs).toBe(163000);
    expect(range.totalBeats).toBe(326);
    expect(calculateMusicTime(range.totalBeats, chart.bpmEvents, chart.bpm, 0)).toBe(161);
    expect(beatsToMs(range.totalBeats, chart.bpmEvents, chart.bpm)).toBe(range.totalDurationMs);
  });

  it.each([null, 1])('preserves a long hold beyond the Simai measures with music duration %s', (duration) => {
    const chart = parseSimaiChart('&inote_5=(120){4}1h[#12],E', 5);
    const range = resolvePlaybackRange([chart], duration);
    expect(chart.measures * 4).toBe(12);
    expect(range).toEqual({ totalDurationMs: 16000, totalBeats: 32 });
  });

  it.each([-1.25, 1.5])('applies first=%s, music offset and BPM changes to the same end position', (first) => {
    const chart = parseSimaiChart(`&first=${first}\n&inote_5=(120){4}1,2,(240)3,4,E`, 5);
    const range = resolvePlaybackRange([chart], 20, 250);
    expect(range.totalDurationMs).toBe(22250 - first * 1000);
    expect(calculateMusicTime(range.totalBeats, chart.bpmEvents, chart.bpm, 250, chart.firstMs))
      .toBeCloseTo(20);
    expect(beatsToMs(range.totalBeats, chart.bpmEvents, chart.bpm)).toBeCloseTo(range.totalDurationMs);
  });

  it('aligns Buddy sides with different BPM and holds to the main chart timeline', () => {
    const { side1, side2 } = parseSimaiBuddyCharts('&inote_2=(120){4}1,\n&inote_102=(60){4}2h[#10],');
    expect(resolvePlaybackRange([side1, side2], 5)).toEqual({ totalDurationMs: 16000, totalBeats: 32 });
    expect(resolvePlaybackRange([side2, side1], 5)).toEqual({ totalDurationMs: 18000, totalBeats: 18 });
  });

  it('keeps video active in the music tail and hides it at the final playback end', () => {
    const chart = parseSimaiChart('&inote_5=(120){4}1,', 5);
    const { totalBeats } = resolvePlaybackRange([chart], 161);
    const input = {
      currentBeats: 320, totalBeats, isPlaying: true, durationSeconds: 161,
      bpmEvents: chart.bpmEvents, bpm: chart.bpm, musicOffset: 0,
    };
    expect(resolveBackgroundVideoFrame(input)).toEqual({ active: true, targetSeconds: 158 });
    expect(resolveBackgroundVideoFrame({ ...input, currentBeats: totalBeats, isPlaying: false }).active).toBe(false);
  });
});

describe('decodeBase64AudioDataUrl', () => {
  it('直接解码内联 WAV，避免 Android WebView 读取 file URL', () => {
    const decoded = decodeBase64AudioDataUrl('data:audio/wav;base64,UklGRg==');
    expect(Array.from(new Uint8Array(decoded!))).toEqual([82, 73, 70, 70]);
  });

  it('保留远程或文件 URL 的 fetch 回退路径', () => {
    expect(decodeBase64AudioDataUrl('./answer.wav')).toBeNull();
  });
});

describe('resolveBackgroundVideoFrame', () => {
  const base = {
    totalBeats: 16,
    isPlaying: true,
    durationSeconds: 60,
    bpmEvents: null,
    bpm: 120,
    musicOffset: 0,
    firstMs: 0,
  } as const;

  it('keeps the cover fallback during the four-beat lead-in', () => {
    expect(resolveBackgroundVideoFrame({ ...base, currentBeats: 4 })).toEqual({
      active: false,
      targetSeconds: 0,
    });
  });

  it('activates the video inside its playback window', () => {
    expect(resolveBackgroundVideoFrame({ ...base, currentBeats: 6 })).toEqual({
      active: true,
      targetSeconds: 1,
    });
  });

  it('returns to the image fallback at the paused chart end or after the video end', () => {
    expect(resolveBackgroundVideoFrame({
      ...base,
      currentBeats: 16,
      isPlaying: false,
    }).active).toBe(false);
    expect(resolveBackgroundVideoFrame({
      ...base,
      currentBeats: 6,
      durationSeconds: 0.5,
    }).active).toBe(false);
  });
});

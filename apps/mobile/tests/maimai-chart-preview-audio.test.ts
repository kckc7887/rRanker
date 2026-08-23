import { describe, expect, it } from 'vitest';
import { decodeBase64AudioDataUrl } from '@/features/maimai-chart-preview/engine/core/audio/AudioManager';
import { resolveBackgroundVideoFrame } from '@/features/maimai-chart-preview/webview-player/timeConversion';

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

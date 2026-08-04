import { describe, expect, it } from 'vitest';
import { decodeBase64AudioDataUrl } from '@/features/maimai-chart-preview/engine/core/audio/AudioManager';

describe('decodeBase64AudioDataUrl', () => {
  it('直接解码内联 WAV，避免 Android WebView 读取 file URL', () => {
    const decoded = decodeBase64AudioDataUrl('data:audio/wav;base64,UklGRg==');
    expect(Array.from(new Uint8Array(decoded!))).toEqual([82, 73, 70, 70]);
  });

  it('保留远程或文件 URL 的 fetch 回退路径', () => {
    expect(decodeBase64AudioDataUrl('./answer.wav')).toBeNull();
  });
});

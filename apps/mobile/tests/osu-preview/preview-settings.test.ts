import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { DEFAULT_PREVIEW_SETTINGS, normalizePreviewSettings } from '../../src/features/osu-chart-preview/webview-player/preview-settings';

describe('preview display preferences', () => {
  it('bounds numeric controls and rejects malformed stored flags without losing defaults', () => {
    const value = normalizePreviewSettings({ holdWidth: 999, backgroundBrightness: -20, backgroundBlur: Infinity,
      storyboardEnabled: 'false', videoEnabled: false, maniaIgnoreSV: true, maniaTrackOpacity: 0, taikoTrackOpacity: 17.8 });
    assert.deepEqual(value, { ...DEFAULT_PREVIEW_SETTINGS, holdWidth: 100, backgroundBrightness: 0,
      videoEnabled: false, maniaIgnoreSV: true, maniaTrackOpacity: 0, taikoTrackOpacity: 18 });
    assert.equal(normalizePreviewSettings({ holdWidth: 0 }).holdWidth, 10);
  });
  it('keeps playback speed independent of mania scroll speed and restores persisted controls', () => {
    assert.deepEqual(normalizePreviewSettings(null), DEFAULT_PREVIEW_SETTINGS);
    assert.deepEqual(normalizePreviewSettings({maniaSkin: 'circle', maniaScrollSpeed: 40}), DEFAULT_PREVIEW_SETTINGS);
    assert.equal(normalizePreviewSettings({ playbackSpeed: 9 }).playbackSpeed, 2);
    assert.equal(normalizePreviewSettings({ playbackSpeed: -1 }).playbackSpeed, 0.5);
    assert.equal(normalizePreviewSettings({ playbackSpeed: 1.27 }).playbackSpeed, 1.25);
    assert.equal(normalizePreviewSettings({ playbackSpeed: NaN }).playbackSpeed, 1);
    const values = {...DEFAULT_PREVIEW_SETTINGS, playbackSpeed: 1.75, holdWidth: 100, backgroundBlur: 12, storyboardEnabled: false};
    assert.deepEqual(normalizePreviewSettings(JSON.parse(JSON.stringify(values))), values);
  });
});

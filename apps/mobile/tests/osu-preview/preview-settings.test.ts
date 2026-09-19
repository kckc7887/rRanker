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
  it('keeps display normalization independent of transport controls and handles invalid persisted data', () => {
    assert.deepEqual(normalizePreviewSettings(null), DEFAULT_PREVIEW_SETTINGS);
    assert.deepEqual(normalizePreviewSettings({maniaSkin: 'circle', maniaScrollSpeed: 40}), DEFAULT_PREVIEW_SETTINGS);
    const values = {...DEFAULT_PREVIEW_SETTINGS, holdWidth: 100, backgroundBlur: 12, storyboardEnabled: false};
    assert.deepEqual(normalizePreviewSettings(JSON.parse(JSON.stringify(values))), values);
  });
});

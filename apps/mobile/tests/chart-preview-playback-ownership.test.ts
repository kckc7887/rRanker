import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function playerSource(feature: string, file = 'main.ts'): string {
  return readFileSync(
    resolve(process.cwd(), `src/features/${feature}/webview-player/${file}`),
    'utf8',
  );
}

/** 播放位置、命令代次、音源与 RAF 只允许存在于会话模块内。 */
const SIMAI_SESSION_STATE = [
  'preciseBeats',
  'playbackEpoch',
  'isPlaying',
  'isAudioClockRunning',
  'audioContext',
  'audioBuffer',
  'musicGain',
  'answerGain',
  'answerManager',
  'sourceNode',
  'sourceGain',
  'rafId',
  'lastRafTs',
  'playbackClock',
];

const PHIGROS_SESSION_STATE = [
  'currentChartTime',
  'isPlaying',
  'isSourcePlaying',
  'audioContext',
  'musicBuffer',
  'musicGain',
  'hitSoundGain',
  'hitSoundBuffers',
  'hitSoundCursor',
  'hitSoundEvents',
  'lastHitSoundTime',
  'activeHitSounds',
  'sourceNode',
  'sourceGain',
  'rafId',
  'lastRafTs',
  'playbackClock',
  'chartDuration',
  'chartOffset',
];

const RIZLINE_SESSION_STATE = [
  'preciseBeats',
  'playbackEpoch',
  'isPlaying',
  'playbackClock',
  'audioBuffer',
  'musicBuffer',
  'sourceNode',
  'rafId',
  'lastRafTs',
];

/**
 * 只允许通过会话属性读取（`session.chartDuration`）；
 * 本文件里自有声明或裸标识符都算 main 另存了一份状态。
 */
function expectNoOwnership(source: string, names: readonly string[]): void {
  expect(names.filter((name) => new RegExp(`(?<![\\w.$])${name}\\b`).test(source))).toEqual([]);
}

describe('谱面确认播放器：main 不持有会话状态', () => {
  it('Simai main 只接线，播放状态归 webview-player/playback.ts', () => {
    const source = playerSource('simai-chart-preview');
    expectNoOwnership(source, SIMAI_SESSION_STATE);
    expect(source).toContain("from './playback'");
    expect(source).toContain('new SimaiPlaybackSession(');
    const session = playerSource('simai-chart-preview', 'playback.ts');
    expect(session).toContain('export class SimaiPlaybackSession');
  });

  it('Phigros main 只接线，播放状态归 webview-player/playback.ts', () => {
    const source = playerSource('phigros-chart-preview');
    expectNoOwnership(source, PHIGROS_SESSION_STATE);
    expect(source).toContain("from './playback'");
    expect(source).toContain('new PhigrosPlaybackSession(');
    const session = playerSource('phigros-chart-preview', 'playback.ts');
    expect(session).toContain('export class PhigrosPlaybackSession');
  });

  it('Rizline main 只接线，播放状态归 PreviewSession', () => {
    const source = playerSource('rizline-chart-preview');
    expectNoOwnership(source, RIZLINE_SESSION_STATE);
    expect(source).toContain('new PreviewSession(');
  });

  it('时间线视图各自拥有密度条、刻度与播放头节点', () => {
    for (const [feature, viewClass] of [
      ['simai-chart-preview', 'SimaiTimelineView'],
      ['phigros-chart-preview', 'PhigrosTimelineView'],
    ] as const) {
      const source = playerSource(feature);
      expect(source).toContain(`new ${viewClass}(`);
      expect(source).not.toMatch(/className = ['"`](fs-)?timeline-(bar|tick|label)/);
      const view = playerSource(feature, 'timelineView.ts');
      expect(view).toContain(`export class ${viewClass}`);
      expect(view).toMatch(/-bar[`'"]/);
    }
  });
});

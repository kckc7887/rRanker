import type { PreviewDifficulty } from '../chart-preview-shared/webview-player/heading';
import type { Chart } from './engine/types';
export type ChartPreviewSettings = {
  hiSpeed?: number;
  playbackSpeed?: number;
  musicVolume?: number;
  soundVolume?: number;
  mirrorMode?: string;
  judgmentLineDesign?: string;
  pinkSlideStart?: boolean;
  slideRotation?: boolean;
  showHitEffect?: boolean;
  judgeHint?: 'distinguish' | 'unified' | 'hidden';
  showFireworks?: boolean;
  backgroundMode?: 'none' | 'image' | 'video';
  videoBackgroundPrompted?: boolean;
};

/** Buddy 宴谱预览侧：'0'=1P，'1'=2P，'dual'=1P+2P 同屏。 */
export type BuddyPreviewSide = '0' | '1' | 'dual';

export type ChartPreviewInjectConfig = {
  chartId: number | string;
  chartUrl?: string;
  musicUrl?: string;
  simaiText?: string;
  parsedChart?: Chart;
  difficulty: number;
  title?: string;
  previewDifficulty?: PreviewDifficulty;
  settings?: ChartPreviewSettings;
  answerSoundUrl?: string;
  backgroundImageUrl?: string;
  backgroundVideoUrl?: string;
  buddySide?: BuddyPreviewSide;
  theme?: 'light' | 'dark';
};

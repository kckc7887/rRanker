export type ChartPreviewSettings = {
  hiSpeed?: number;
  playbackSpeed?: number;
  musicVolume?: number;
  soundVolume?: number;
  mirrorMode?: string;
  judgmentLineDesign?: string;
  pinkSlideStart?: boolean;
  slideRotation?: boolean;
  highlightExNotes?: boolean;
  normalColorBreakSlide?: boolean;
  showHitEffect?: boolean;
  /** 判定提示：区分 / 不区分 / 不显示。缺省 distinguish。 */
  judgeHint?: 'distinguish' | 'unified' | 'hidden';
  showFireworks?: boolean;
  backgroundMode?: 'none' | 'image' | 'video';
  videoBackgroundPrompted?: boolean;
  videoBackgroundConfirmed?: boolean;
};

/** Buddy 宴谱预览侧：'0'=1P，'1'=2P，'dual'=1P+2P 同屏。 */
export type BuddyPreviewSide = '0' | '1' | 'dual';

export type ChartPreviewInjectConfig = {
  chartId: number;
  difficulty: number;
  title?: string;
  settings?: ChartPreviewSettings;
  answerSoundUrl?: string;
  backgroundImageUrl?: string;
  backgroundVideoUrl?: string;
  buddySide?: BuddyPreviewSide;
  /** 播放器界面主题跟随应用，缺省为深色。 */
  theme?: 'light' | 'dark';
};


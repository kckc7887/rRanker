import {
  parseChartPreviewBridgeMessage as parseChartPreviewBridgeMessageBase,
} from '@/features/chart-preview-shared/chart-preview-bridge';
import { createChartPreviewInjectors } from '@/features/chart-preview-shared/chart-preview-inject-factory';

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
  showFireworks?: boolean;
};

/** Buddy 宴谱预览侧：'0'=1P，'1'=2P，'dual'=1P+2P 同屏。 */
export type BuddyPreviewSide = '0' | '1' | 'dual';

export type ChartPreviewInjectConfig = {
  chartId: number;
  difficulty: number;
  title?: string;
  settings?: ChartPreviewSettings;
  answerSoundUrl?: string;
  buddySide?: BuddyPreviewSide;
  /** 播放器界面主题跟随应用，缺省为深色。 */
  theme?: 'light' | 'dark';
};

export type ChartPreviewBridgeMessage = ChartPreviewSettings & {
  type?: string;
  message?: string;
  active?: boolean;
};

export function parseChartPreviewBridgeMessage(raw: string): ChartPreviewBridgeMessage | null {
  return parseChartPreviewBridgeMessageBase(raw) as ChartPreviewBridgeMessage | null;
}

const chartPreviewInjectors = createChartPreviewInjectors<ChartPreviewInjectConfig>({
  globalVar: '__CHART_PREVIEW__',
  placeholder: '<!--CHART_PREVIEW_CONFIG-->',
  serialize: (config) => JSON.stringify({
    chartId: config.chartId,
    difficulty: config.difficulty,
    title: config.title ?? '',
    settings: config.settings ?? null,
    answerSoundUrl: config.answerSoundUrl,
    buddySide: config.buddySide ?? null,
    theme: config.theme ?? 'dark',
  }),
});

export function buildChartPreviewConfigJson(config: ChartPreviewInjectConfig): string {
  return chartPreviewInjectors.buildConfigJson(config);
}

export function buildChartPreviewConfigScript(config: ChartPreviewInjectConfig): string {
  return chartPreviewInjectors.buildConfigScript(config);
}

export function buildChartPreviewInjectedJavaScript(config: ChartPreviewInjectConfig): string {
  return chartPreviewInjectors.buildInjectedJavaScript(config);
}

export {
  chartPreviewStopScript,
  chartPreviewExitFullscreenScript,
} from '@/features/chart-preview-shared/chart-preview-bridge';

/** 把配置脚本写入 HTML 模板（file:// 下比 injectedJavaScript 更可靠）。 */
export function applyChartPreviewConfigToHtml(html: string, config: ChartPreviewInjectConfig): string {
  return chartPreviewInjectors.applyConfigToHtml(html, config);
}

import type { ChartType } from './models';
import { isUtageSongId, normalizeSongId } from './catalog';

/** 水鱼 / LXNS 谱面资源 chart_id；DX = 10000 + songId。 */
export function maimaiChartPreviewChartId(songId: string | number, chartType: ChartType): number {
  const normalized = normalizeSongId(songId);
  const numericId = Number(normalized);
  if (!Number.isSafeInteger(numericId) || numericId < 0) {
    throw new Error(`无效的歌曲 ID：${songId}`);
  }
  if (chartType === 'UTAGE' || isUtageSongId(numericId)) return numericId;
  if (chartType === 'DX') return 10000 + numericId;
  return numericId;
}

/** 预览曲资源 id：chartId % 10000（宴谱落到原曲）。 */
export function maimaiChartPreviewMusicId(chartId: number): number {
  if (!Number.isSafeInteger(chartId) || chartId < 0) {
    throw new Error(`无效的谱面 ID：${chartId}`);
  }
  return chartId % 10000;
}

/**
 * 普通难度 levelIndex（0=BASIC…4=Re:MASTER）→ 引擎 ChartDifficulty（2…6）。
 * 与水鱼 URL `difficulty + 2` 一致。
 */
export function maimaiChartPreviewEngineDifficulty(levelIndex: number): 2 | 3 | 4 | 5 | 6 {
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex > 4) {
    throw new Error(`无效的难度索引：${levelIndex}`);
  }
  return (levelIndex + 2) as 2 | 3 | 4 | 5 | 6;
}

/**
 * Buddy 1P/2P（side 0/1）→ 引擎难度 2/3。
 * 对齐水鱼宴谱 Buddy 预览入口。
 */
export function maimaiChartPreviewBuddyEngineDifficulty(buddySide: 0 | 1): 2 | 3 {
  return (buddySide + 2) as 2 | 3;
}

export function maimaiChartPreviewSimaiUrl(chartId: number): string {
  return `https://assets2.lxns.net/maimai/chart/${chartId}.txt`;
}

export function maimaiChartPreviewMusicUrl(chartId: number): string {
  return `https://assets2.lxns.net/maimai/music/${maimaiChartPreviewMusicId(chartId)}.mp3`;
}

export function maimaiChartPreviewVideoUrl(chartId: number): string {
  return `https://maimai-video.lxns.net/${maimaiChartPreviewMusicId(chartId)}.mp4`;
}

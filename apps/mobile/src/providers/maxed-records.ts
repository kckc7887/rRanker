import type { CatalogSnapshot, Chart, ScoreRecord } from '@/domain/models';

/**
 * 公共满成绩生成器参数：统一曲库（CatalogSnapshot）下各游戏注入自己的
 * 满分常量与成绩字段构造（maimai 达成率 101 / Phigros 100 等）。
 */
export type MaxedRecordConfig = {
  /** 满成绩达成率/ACC（maimai 101、Phigros 100）。 */
  achievements: number;
  /** 谱面过滤：返回 false 时不生成成绩（如 Phigros 跳过非法 levelIndex）；缺省全部生成。 */
  includeChart?: (chart: Chart) => boolean;
  /** 满分 DXScore/分数（maimai 为物量 ×3 或无物量 null，Phigros 为满分常量）。 */
  dxScore: (chart: Chart) => number | null;
  /** 单谱面满 Rating。 */
  rating: (chart: Chart) => number;
  fc: string | null;
  fs: string | null;
  rate: string;
  /** 结果排序（如 Phigros 按 RKS 降序）；缺省保持曲库顺序。 */
  compare?: (left: ScoreRecord, right: ScoreRecord) => number;
};

/**
 * 全满示例账号的同构生成骨架：
 * catalog.songs → 跳过 disabled 歌曲 → 逐谱面构造统一满成绩 ScoreRecord。
 */
export function buildMaxedScoreRecords(
  catalog: CatalogSnapshot,
  config: MaxedRecordConfig,
): ScoreRecord[] {
  const records = catalog.songs.flatMap((song) => {
    if (song.disabled) return [];
    return song.charts.flatMap((chart): ScoreRecord[] => {
      if (config.includeChart?.(chart) === false) return [];
      return [{
        ...chart,
        title: song.title,
        achievements: config.achievements,
        dxScore: config.dxScore(chart),
        rating: config.rating(chart),
        fc: config.fc,
        fs: config.fs,
        rate: config.rate,
        version: song.version,
      }];
    });
  });
  return config.compare ? records.sort(config.compare) : records;
}

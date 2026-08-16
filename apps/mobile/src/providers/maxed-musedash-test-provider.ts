import { MUSEDASH_TEST_USER_ID } from '@/domain/bound-account';
import type { DataSource, Player, ScoreRecord } from '@/domain/models';
import type { CatalogDrivenScoreProvider } from '@/providers/contracts';
import { generatedSource } from '@/providers/generated-source';
import {
  museDashDiffdiffMap,
  museDashSongTitle,
  museDashSongsFromAlbums,
  type MuseDashAlbumsResponse,
  type MuseDashDiffdiffEntry,
  type MuseDashPlay,
  type MuseDashPlayDetail,
  type MuseDashPlayer,
} from '@/domain/muse-dash';

export type MaxedMuseDashPlayerSnapshot = { data: MuseDashPlayer; source: DataSource };

/** 单谱面理论满分（Muse Dash 满分 1,000,000）。 */
export const MUSE_DASH_MAX_SCORE = 1_000_000;

/**
 * 全满成绩的社区 Rating 值（sum）：真实数据语义为 P × 1000，
 * 其中 P = D(a − a² + a⁴)，D 为定数；全 AP（a = 1）时 P = D。
 */
export function maxedMuseDashChartSum(constant: number | undefined): number | undefined {
  return constant === undefined ? undefined : Math.round(constant * 1000);
}

/**
 * RL 公式（上游公开口径）：每曲 P = D(a − a² + a⁴)，按 P 降序，
 * RL = (1/5) × Σ[i=1→n] (0.8^(i-1) × P_i)。示例账号全 AP（a = 1）时 P = D（定数）。
 */
export function buildMaxedMuseDashRl(plays: readonly MuseDashPlay[]): number {
  const p = plays
    .flatMap((play) => (play.sum == null ? [] : [play.sum / 1000]))
    .sort((left, right) => right - left);
  let total = 0;
  let weight = 1;
  for (const value of p) {
    total += weight * value;
    weight *= 0.8;
  }
  return total / 5;
}

/** 喵斯难度档 → 统一难度槽位：按档位序号 0-4 对齐（EASY/HARD/MASTER/HIDDEN/EX）。 */
const MUSEDASH_UNIFIED_DIFFICULTIES = [
  'basic', 'advanced', 'expert', 'master', 'remaster',
] as const;

/** 统一模型侧：为曲库中每个非空难度档生成满成绩 ScoreRecord；difficultyConstant 0 表示该谱面无社区定数。 */
export function buildMaxedMuseDashRecords(
  albums: MuseDashAlbumsResponse,
  constants: ReadonlyMap<string, MuseDashDiffdiffEntry> | null,
): ScoreRecord[] {
  return museDashSongsFromAlbums(albums).flatMap(({ song, albumTitle }) => (
    song.difficulty.flatMap((level, difficultyIndex): ScoreRecord[] => {
      if (level === '0') return [];
      const constant = constants?.get(`${song.uid}:${difficultyIndex}`)?.[4];
      return [{
        songId: song.uid,
        type: 'SD',
        levelIndex: difficultyIndex,
        level,
        difficulty: MUSEDASH_UNIFIED_DIFFICULTIES[difficultyIndex],
        difficultyConstant: constant ?? 0,
        title: museDashSongTitle(song),
        achievements: 100,
        dxScore: MUSE_DASH_MAX_SCORE,
        rating: maxedMuseDashChartSum(constant) ?? 0,
        fc: 'ap',
        fs: null,
        rate: 's',
        version: albumTitle,
      }];
    })
  ));
}

/** 转换层：统一 ScoreRecord → 旧 MuseDashPlay 兼容模型（字段值与迁移前直构完全一致；定数表常量均为正数，0 即无定数、sum 省略）。 */
function museDashPlayFromRecord(record: ScoreRecord): MuseDashPlay {
  return {
    uid: record.songId,
    difficulty: record.levelIndex,
    score: MUSE_DASH_MAX_SCORE,
    acc: 100,
    sum: maxedMuseDashChartSum(record.difficultyConstant > 0 ? record.difficultyConstant : undefined),
    i: 1,
    platform: 'mobile',
    history: { lastRank: 1 },
    character_uid: '1',
    elfin_uid: '1',
  };
}

export function buildMaxedMuseDashPlays(
  albums: MuseDashAlbumsResponse,
  constants: ReadonlyMap<string, MuseDashDiffdiffEntry> | null,
): MuseDashPlay[] {
  return buildMaxedMuseDashRecords(albums, constants).map(museDashPlayFromRecord);
}

export function buildMaxedMuseDashPlayer(
  albums: MuseDashAlbumsResponse,
  diffdiff: readonly MuseDashDiffdiffEntry[],
  displayName = '示例账号',
): MuseDashPlayer {
  const plays = buildMaxedMuseDashPlays(albums, museDashDiffdiffMap(diffdiff));
  return {
    lastUpdate: Date.now(),
    rl: buildMaxedMuseDashRl(plays),
    plays,
    user: {
      user_id: MUSEDASH_TEST_USER_ID,
      nickname: displayName,
    },
  };
}

/** 全满成绩明细：miss 为 0 且 ACC 100 → AP。 */
export function buildMaxedMuseDashPlayDetail(): MuseDashPlayDetail {
  return {
    play: {
      acc: 100,
      miss: 0,
      judge: 'AP',
      score: MUSE_DASH_MAX_SCORE,
      character_uid: '1',
      elfin_uid: '1',
    },
    now: Date.now(),
  };
}

export function maxedMuseDashPlayerSnapshot(
  albums: MuseDashAlbumsResponse,
  diffdiff: readonly MuseDashDiffdiffEntry[],
  displayName = '示例账号',
): MaxedMuseDashPlayerSnapshot {
  return {
    data: buildMaxedMuseDashPlayer(albums, diffdiff, displayName),
    source: generatedSource(),
  };
}

export type MaxedMuseDashPlayDetailSnapshot = { data: MuseDashPlayDetail; source: DataSource };

export function maxedMuseDashPlayDetailSnapshot(): MaxedMuseDashPlayDetailSnapshot {
  return {
    data: buildMaxedMuseDashPlayDetail(),
    source: generatedSource(),
  };
}

/** 统一模型侧的曲库输入：专辑曲库 + 定数表索引（null 表示完全无定数表）。 */
export type MaxedMuseDashCatalog = {
  albums: MuseDashAlbumsResponse;
  constants: ReadonlyMap<string, MuseDashDiffdiffEntry> | null;
};

export class MaxedMuseDashTestProvider implements CatalogDrivenScoreProvider<MaxedMuseDashCatalog> {
  constructor(private readonly displayName = '示例账号') {}

  async getPlayer(): Promise<Player> {
    return {
      id: MUSEDASH_TEST_USER_ID,
      displayName: this.displayName,
      rating: 0,
      source: generatedSource(),
    };
  }

  async getRecordsFromCatalog(catalog: MaxedMuseDashCatalog): Promise<ScoreRecord[]> {
    return buildMaxedMuseDashRecords(catalog.albums, catalog.constants);
  }
}

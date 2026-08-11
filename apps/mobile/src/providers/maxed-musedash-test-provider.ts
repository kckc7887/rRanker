import { MUSEDASH_TEST_USER_ID } from '@/domain/bound-account';
import type { DataSource } from '@/domain/models';
import {
  museDashDiffdiffMap,
  museDashSongsFromAlbums,
  type MuseDashAlbumsResponse,
  type MuseDashDiffdiffEntry,
  type MuseDashPlay,
  type MuseDashPlayDetail,
  type MuseDashPlayer,
} from '@/domain/muse-dash';

export type MaxedMuseDashPlayerSnapshot = { data: MuseDashPlayer; source: DataSource };

function generatedSource(): DataSource {
  return {
    kind: 'generated',
    label: '示例查分器（全曲全谱面满成绩）',
    updatedAt: new Date().toISOString(),
    isStale: false,
  };
}

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

export function buildMaxedMuseDashPlays(
  albums: MuseDashAlbumsResponse,
  constants: ReadonlyMap<string, MuseDashDiffdiffEntry> | null,
): MuseDashPlay[] {
  return museDashSongsFromAlbums(albums).flatMap(({ song }) => (
    song.difficulty.flatMap((level, difficultyIndex): MuseDashPlay[] => {
      if (level === '0') return [];
      const constant = constants?.get(`${song.uid}:${difficultyIndex}`)?.[4];
      return [{
        uid: song.uid,
        difficulty: difficultyIndex,
        score: MUSE_DASH_MAX_SCORE,
        acc: 100,
        sum: maxedMuseDashChartSum(constant),
        i: 1,
        platform: 'mobile',
        history: { lastRank: 1 },
        character_uid: '1',
        elfin_uid: '1',
      }];
    })
  ));
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

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

export const MUSE_DASH_MAX_SCORE = 1_000_000;

/** P = D(a − a² + a⁴)，sum = P × 1000；全 AP 时 a = 1。 */
export function maxedMuseDashChartSum(constant: number | undefined): number | undefined {
  return constant === undefined ? undefined : Math.round(constant * 1000);
}

/** 按 P 降序计算 RL = Σ(0.8^(i−1) × P_i) / 5。 */
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

const MUSEDASH_UNIFIED_DIFFICULTIES = [
  'basic', 'advanced', 'expert', 'master', 'remaster',
] as const;

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

import type { GameId, ProviderId } from './game-bind-options';
import type { GameProfile } from './game-profile';
import type { DataSource, Player, ScoreRecord, ScoreSnapshot } from './models';

/** 通用 BestN 分区；具体谱面条目仍可按游戏扩展。 */
export type BestListSection = {
  id: string;
  title: string;
  records: ScoreRecord[];
};

/** 各游戏玩家主分数（名字因游戏而异：DX Rating / RKS / …） */
export type PlayerScoreSummary = {
  label: string;
  value: number;
  display: string;
};

/**
 * 分游戏载荷。新游戏新增 kind，不要往舞萌字段里塞无关数据。
 * - maimai：DX Rating + B35/B15 + 水鱼/落雪成绩曲库
 * - phigros：RKS + Phi3/Best27
 * - empty：测试等空壳游戏，不继承舞萌成绩
 * - unsupported：已登记但尚未接入成绩模型的游戏
 */
export type GamePayload =
  | {
      kind: 'maimai';
      player: Player;
      records: ScoreRecord[];
      bestSections: BestListSection[];
      playerScore: PlayerScoreSummary;
      currentVersionTitle: string;
      unmatchedRecordCount: number;
      source: DataSource;
      catalogSource: DataSource;
      snapshot: ScoreSnapshot;
    }
  | {
      kind: 'phigros';
      player: Player;
      records: ScoreRecord[];
      bestSections: BestListSection[];
      playerScore: PlayerScoreSummary;
      challengeModeRank: number;
      source: DataSource;
      catalogSource: DataSource;
      avatarUrl?: string | null;
    }
  | {
      kind: 'empty';
      gameId: GameId;
      displayName: string;
      source: DataSource;
    }
  | {
      kind: 'unsupported';
      gameId: GameId;
      displayName: string;
      message: string;
    };

/** 当前选中游戏的一份独立数据包（与其他游戏互不共用）。 */
export type GameDataBundle = {
  gameId: GameId;
  providerId: ProviderId | null;
  profile: GameProfile;
  payload: GamePayload;
};

export function formatPlayerScore(value: number, digits: number): string {
  if (digits <= 0) return String(value);
  return value.toString().padStart(digits, '0');
}

export function maimaiPayloadFromSnapshot(snapshot: ScoreSnapshot, profile: GameProfile): Extract<GamePayload, { kind: 'maimai' }> {
  return {
    kind: 'maimai',
    player: snapshot.player,
    records: snapshot.records,
    bestSections: [
      { id: 'b35', title: profile.bestSections[0]?.title ?? 'B35', records: snapshot.best50.b35 },
      { id: 'b15', title: profile.bestSections[1]?.title ?? 'B15', records: snapshot.best50.b15 },
    ],
    playerScore: {
      label: profile.ratingLabel,
      value: snapshot.best50.rating,
      display: formatPlayerScore(snapshot.best50.rating, profile.ratingDigits),
    },
    currentVersionTitle: snapshot.best50.currentVersion.title,
    unmatchedRecordCount: snapshot.best50.unmatchedRecordCount,
    source: snapshot.source,
    catalogSource: snapshot.catalogSource,
    snapshot,
  };
}

export function emptyGamePayload(gameId: GameId, displayName: string): Extract<GamePayload, { kind: 'empty' }> {
  return {
    kind: 'empty',
    gameId,
    displayName,
    source: {
      kind: 'fixture',
      label: displayName,
      updatedAt: new Date().toISOString(),
      isStale: false,
    },
  };
}

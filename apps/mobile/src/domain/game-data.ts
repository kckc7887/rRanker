import { buildLxnsIconUrl } from './account-avatar';
import { buildChunithmMapIconUrl } from './chunithm-personal';
import { resolveTufAvatarUrl } from './tuf';
import { majdataAvatarUrl } from './majdata';
import { buildRizlineRecords, selectRizlineBest, formatRizlineRks, type RizlineCatalogData, type RizlineSnapshot } from './rizline';
import type { GameId, GameProviderId, OsuModeGameId } from './game-bind-options';
import type { GameProfile } from './game-profile';
import type { DataSource, Player, ScoreRecord, ScoreSnapshot } from './models';
import type { ChunithmPlayer, ChunithmScore } from './chunithm-personal';
import type { TufPlayer } from './tuf';
import type { MuseDashPlayer } from './muse-dash';
import type { PhiraBestSnapshot, PhiraPlayerSnapshot } from './phira';
import { formatOsuPp, type OsuBestScore, type OsuPlayer, type OsuSnapshot } from './osu';

export type BestListSection = {
  id: string;
  title: string;
  records: ScoreRecord[];
};

export type PlayerScoreSummary = {
  label: string;
  value: number;
  display: string;
};

export type ChunithmBestListSection = {
  id: 'b30' | 'new20';
  title: 'Best 30' | 'New 20';
  scores: ChunithmScore[];
};

export type GamePayload =
  | ReturnType<typeof rizlinePayloadFromSnapshot>
  | { kind: 'majdata-net'; snapshot: import('./majdata').MajdataSnapshot; playerScore: PlayerScoreSummary; source: DataSource }
  | {
      kind: 'adofai';
      player: TufPlayer;
      playerScore: PlayerScoreSummary;
      source: DataSource;
    }
  | {
      kind: 'musedash';
      player: MuseDashPlayer;
      playerScore: PlayerScoreSummary;
      source: DataSource;
    }
  | {
      kind: 'phira';
      snapshot: PhiraPlayerSnapshot;
      bests: PhiraBestSnapshot | null;
      playerScore: PlayerScoreSummary;
      source: DataSource;
    }
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
      resourceRevision?: string;
      player: Player;
      records: ScoreRecord[];
      bestSections: BestListSection[];
      playerScore: PlayerScoreSummary;
      challengeModeRank: number;
      source: DataSource;
      saveUpdatedAt: string;
      catalogSource: DataSource;
      avatarUrl?: string | null;
      avatarKey?: string | null;
      backgroundSongId?: string | null;
      dataAmount: string;
      progress: {
        cleared: [number, number, number, number];
        fullCombo: [number, number, number, number];
        phi: [number, number, number, number];
      };
    }
  | {
      kind: 'chunithm';
      player: ChunithmPlayer | null;
      scores: ChunithmScore[];
      bestSections: ChunithmBestListSection[];
      /** Selection 10 只追加到成绩图，不进入最佳列表。 */
      selections: ChunithmScore[];
      playerScore: PlayerScoreSummary;
      source: DataSource;
      hasSyncedData: boolean;
    }
  | {
      kind: 'osu';
      player: OsuPlayer;
      bestScores: OsuBestScore[];
      playerScore: PlayerScoreSummary;
      source: DataSource;
    }
  | {
      kind: 'empty';
      gameId: GameId;
      displayName: string;
      source: DataSource;
    };

export type GamePayloadKind = GamePayload['kind'];

type GamePrimaryPayloadKind<G extends GameId> = G extends OsuModeGameId ? 'osu' : G;
export type EmptyGamePayloadOf<G extends GameId> = Extract<GamePayload, { kind: 'empty' }> & { gameId: G };
export type GamePayloadOf<G extends GameId> =
  | Extract<GamePayload, { kind: GamePrimaryPayloadKind<G> }>
  | EmptyGamePayloadOf<G>;

export type GameDataBundleFor<G extends GameId> = G extends GameId ? {
  gameId: G;
  providerId: GameProviderId<G> | null;
  profile: GameProfile<G>;
  payload: GamePayloadOf<G>;
} : never;

export type GameDataBundle = { [G in GameId]: GameDataBundleFor<G> }[GameId];

export type PhigrosGameDataPayload = Extract<GamePayload, { kind: 'phigros' }>;

export function rizlinePayloadFromSnapshot(snapshot: RizlineSnapshot, catalog?: RizlineCatalogData) {
  const records = buildRizlineRecords(snapshot.save, catalog?.snapshot);
  const { userId, username, totalRks } = snapshot.save;
  return { kind: 'rizline' as const, snapshot, player: { userId, username, totalRks }, records,
    requiresLogin: snapshot.requiresLogin === true,
    best: selectRizlineBest(records), source: snapshot.source, catalogSource: catalog?.source,
    playerScore: { label: 'Ranking Score', value: totalRks, display: formatRizlineRks(totalRks) } };
}

export function phigrosPayloadFromSnapshot(
  snapshot: Pick<PhigrosGameDataPayload, 'player' | 'records' | 'bestSections' | 'challengeModeRank' | 'source' | 'progress'>,
  catalogSource: DataSource,
  details: Partial<Pick<PhigrosGameDataPayload, 'resourceRevision' | 'avatarUrl' | 'avatarKey' | 'backgroundSongId' | 'dataAmount'>> = {},
): PhigrosGameDataPayload {
  return {
    kind: 'phigros',
    player: snapshot.player,
    records: snapshot.records,
    bestSections: snapshot.bestSections,
    playerScore: { label: 'Raking Score', value: snapshot.player.rating, display: snapshot.player.rating.toFixed(4) },
    challengeModeRank: snapshot.challengeModeRank,
    source: snapshot.source,
    saveUpdatedAt: snapshot.source.updatedAt,
    catalogSource,
    avatarUrl: null,
    avatarKey: null,
    backgroundSongId: null,
    dataAmount: '0KiB',
    progress: snapshot.progress,
    ...details,
  };
}

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

export function emptyGamePayload<G extends GameId>(gameId: G, displayName: string): EmptyGamePayloadOf<G> {
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

export function osuPayloadFromSnapshot(
  snapshot: OsuSnapshot,
  profile: GameProfile,
): Extract<GamePayload, { kind: 'osu' }> {
  return {
    kind: 'osu',
    player: snapshot.data.player,
    bestScores: snapshot.data.bestScores,
    playerScore: {
      label: profile.ratingLabel,
      value: snapshot.data.player.pp,
      display: formatOsuPp(snapshot.data.player.pp),
    },
    source: snapshot.source,
  };
}

export function gameAccountMetadata(bundle: GameDataBundle): ({
  scoreDisplay: string; displayName?: string; avatarUrl?: string | null;
  challengeModeRank?: number | null; ratingPossession?: string | null;
  storedDisplayName?: string;
} | null) {
  const { providerId, profile } = bundle;
  const p: GamePayload = bundle.payload;
  switch (p.kind) {
    case 'rizline': return { scoreDisplay: p.playerScore.display, displayName: p.player.username, storedDisplayName: p.player.username };
    case 'maimai': return { scoreDisplay: formatPlayerScore(p.playerScore.value, profile.ratingDigits),
      displayName: p.player.displayName,
      avatarUrl: providerId === 'lxns' ? buildLxnsIconUrl(p.player.presentation?.iconId) : undefined };
    case 'phigros': return { scoreDisplay: p.playerScore.display, displayName: p.player.displayName,
      avatarUrl: p.avatarUrl ?? undefined, challengeModeRank: p.challengeModeRank,
      storedDisplayName: providerId === 'phi-taptap' ? p.player.displayName : undefined };
    case 'chunithm': return { scoreDisplay: p.playerScore.display, displayName: p.player?.name,
      avatarUrl: buildChunithmMapIconUrl(p.player?.map_icon?.id) ?? undefined,
      ratingPossession: p.player?.rating_possession ?? null,
      storedDisplayName: providerId === 'lxns' ? p.player?.name ?? '落雪账号（待同步）' : undefined };
    case 'adofai': return { scoreDisplay: p.playerScore.display, displayName: p.player.name, avatarUrl: resolveTufAvatarUrl(p.player) ?? undefined };
    case 'musedash': return { scoreDisplay: p.playerScore.display, displayName: p.player.user.nickname };
    case 'majdata-net': return { scoreDisplay: p.playerScore.display, displayName: p.snapshot.player.username,
      avatarUrl: majdataAvatarUrl(p.snapshot.player.username), storedDisplayName: p.snapshot.player.username };
    case 'phira': return { scoreDisplay: p.playerScore.display, displayName: p.snapshot.player.name, avatarUrl: p.snapshot.player.avatar ?? undefined };
    case 'osu': return { scoreDisplay: p.playerScore.display, displayName: p.player.username, avatarUrl: p.player.avatarUrl ?? undefined };
    default: return null;
  }
}

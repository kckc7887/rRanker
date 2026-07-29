import type { GameId } from './game-bind-options';
import type { ChartType } from './models';

export type GameContentId<TGameId extends string = GameId> = {
  gameId: TGameId;
  songId: string;
};

export type GameChartIdentity<TGameId extends string = GameId> = GameContentId<TGameId> & {
  chartId: string;
  order: number;
  libraryRef?: {
    type: ChartType;
    levelIndex: number;
  };
};

export type GameNoteValue = {
  key: string;
  label: string;
  value: number;
};

export type GameNoteGroup = {
  key: string;
  label?: string;
  values: readonly GameNoteValue[];
};

export type GameChart<
  TGameId extends string = GameId,
  TExtension = unknown,
> = GameChartIdentity<TGameId> & {
  label: string;
  level: string;
  constant?: number;
  charter?: string;
  version?: string;
  notes: readonly GameNoteGroup[];
  extension: TExtension;
};

export type GameSong<
  TGameId extends string = GameId,
  TChart extends GameChart<TGameId> = GameChart<TGameId>,
  TExtension = unknown,
> = GameContentId<TGameId> & {
  title: string;
  artist?: string;
  metadata: Readonly<Record<string, string | number | boolean | undefined>>;
  charts: readonly TChart[];
  extension: TExtension;
};

export type GameScore<
  TGameId extends string = GameId,
  TExtension = unknown,
> = GameChartIdentity<TGameId> & {
  key: string;
  title: string;
  rating?: number;
  extension: TExtension;
};

export interface GameContentAdapter<
  TGameId extends string,
  TRawSong,
  TRawChart,
  TRawScore,
  TSongExtension = unknown,
  TChartExtension = unknown,
  TScoreExtension = unknown,
> {
  readonly gameId: TGameId;
  normalizeSong(song: TRawSong): GameSong<TGameId, GameChart<TGameId, TChartExtension>, TSongExtension>;
  normalizeChart(chart: TRawChart): GameChart<TGameId, TChartExtension>;
  normalizeScore(score: TRawScore): GameScore<TGameId, TScoreExtension>;
}

import type { GameNoteGroup } from '@/domain/game-content';

export type TextEffect = 'plain' | 'gradient' | 'flowing-gradient';

export type MetricPresentation = {
  key: string;
  label?: string;
  text: string;
  tone?: string;
  effect?: TextEffect;
};

export type BadgePresentation = {
  key: string;
  label: string;
  value?: string;
  tone: string;
  effect?: TextEffect;
};

export type SongDetailRoute = {
  songId: string;
  chartType?: string;
  levelIndex?: number;
  /** 游戏侧可选的详情定位参数；共享卡片只负责透传，不解释具体语义。 */
  params?: Readonly<Record<string, string>>;
};

export type ScoreCardPresentation<TGameId extends string = string> = {
  key: string;
  gameId: TGameId;
  route: SongDetailRoute;
  position?: number;
  title: string;
  accessibilityLabel: string;
  primaryMetric: MetricPresentation;
  secondaryMetrics: readonly MetricPresentation[];
  difficulty: BadgePresentation;
  grade?: BadgePresentation;
  achievementRows: readonly (readonly BadgePresentation[])[];
  supportingText?: string;
};

export type SongRowPresentation<TGameId extends string = string> = {
  key: string;
  gameId: TGameId;
  route: SongDetailRoute;
  title: string;
  subtitle: string;
  accessibilityLabel: string;
  chartBadges: readonly BadgePresentation[];
};

export type BestSectionPresentation<
  TGameId extends string = string,
> = {
  id: string;
  title: string;
  items: readonly ScoreCardPresentation<TGameId>[];
};

export type NoteGroupPresentation = GameNoteGroup;

export type ChartCardPresentation<TGameId extends string = string> = {
  key: string;
  gameId: TGameId;
  route: SongDetailRoute;
  difficulty: BadgePresentation;
  primaryMetric: MetricPresentation;
  secondaryMetrics: readonly MetricPresentation[];
  grade?: BadgePresentation;
  achievementRows: readonly (readonly BadgePresentation[])[];
  charter: string;
  notes: readonly NoteGroupPresentation[];
};

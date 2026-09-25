import type { DetailTargetRoute } from '@/domain/detail-target';
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

/**
 * 详情跳转参数：`DetailTarget` 的编码形态，编解码集中在 `domain/detail-target.ts`。
 * 共享卡片只透传，具体游戏的语义由该模块按游戏判别。
 */
export type SongDetailRoute = DetailTargetRoute;

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

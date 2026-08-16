import {
  CHUNITHM_DIFFICULTY_LABELS,
  type ChunithmLevelIndex,
} from '@/domain/chunithm';
import { CHUNITHM_DIFFICULTY_THEME } from '@/domain/chunithm-level-theme';
import { SPECIAL_DIFFICULTY_GRADIENT } from '@/components/special-difficulty-theme';
import { GameDifficultyBadge } from '@/components/game-content/GameDifficultyBadge';

export const CHUNITHM_WORLDS_END_GRADIENT = SPECIAL_DIFFICULTY_GRADIENT;

export type ChunithmDifficultyBadgeDisplay = 'constant' | 'label' | 'label-and-value';

export function ChunithmDifficultyBadge({
  levelIndex,
  level,
  constant,
  display = 'constant',
  worldsEndLabel,
}: {
  levelIndex: ChunithmLevelIndex;
  level?: string;
  constant?: number;
  display?: ChunithmDifficultyBadgeDisplay;
  worldsEndLabel?: string;
}) {
  const colors = CHUNITHM_DIFFICULTY_THEME[levelIndex];
  const label = CHUNITHM_DIFFICULTY_LABELS[levelIndex];
  const constantText = constant === undefined ? '—' : constant.toFixed(1);
  const valueText = levelIndex === 5 ? (worldsEndLabel?.trim() || '—') : constantText;
  const text = display === 'label'
    ? label
    : display === 'label-and-value'
      ? `${label} (${valueText})`
      : valueText;
  const accessibilityLabel = levelIndex === 5
    ? `${label}，属性星级 ${valueText}`
    : `${label}，标级 ${level ?? '未知'}，定数 ${constantText}`;

  if (levelIndex === 5) {
    return (
      <GameDifficultyBadge
        accessibilityLabel={accessibilityLabel}
        special={{ gradient: CHUNITHM_WORLDS_END_GRADIENT, textColor: colors.text }}
        testID="chunithm-worlds-end-badge"
        text={text}
        theme={colors}
      />
    );
  }

  return <GameDifficultyBadge accessibilityLabel={accessibilityLabel} text={text} theme={colors} />;
}

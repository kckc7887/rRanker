import { MUSE_DASH_DIFFICULTY_LABELS } from '@/domain/muse-dash';
import { museDashLevelTheme } from '@/domain/musedash-level-theme';
import { isNumericMuseDashLevel } from '@/features/game-content/adapters';
import { GameDifficultyBadge } from '@/components/game-content/GameDifficultyBadge';

export type MuseDashDifficultyBadgeDisplay = 'constant' | 'label' | 'label-and-value';

/** 难度实心胶囊：EASY 绿 / HARD 蓝 / MASTER 粉 / HIDDEN 黑 / EX 白（白底深字）。 */
export function MuseDashDifficultyBadge({
  levelIndex,
  level,
  constant,
  display = 'constant',
}: {
  levelIndex: number;
  level?: string;
  constant?: number;
  display?: MuseDashDifficultyBadgeDisplay;
}) {
  const colors = museDashLevelTheme(levelIndex);
  const label = MUSE_DASH_DIFFICULTY_LABELS[levelIndex];
  const constantText = constant === undefined ? undefined : constant.toFixed(2);
  const text = display === 'label'
    ? label
    : display === 'label-and-value'
      ? `${label} (${constantText ?? level ?? '—'})`
      : constantText != null
        ? (level && !isNumericMuseDashLevel(level) ? `${level} ${constantText}` : constantText)
        : level ?? '—';
  const accessibilityLabel = display === 'constant'
    ? `${label}，定数 ${constantText ?? '未知'}`
    : `${label}，标级 ${level ?? '未知'}，定数 ${constantText ?? '未知'}`;
  return <GameDifficultyBadge accessibilityLabel={accessibilityLabel} text={text} theme={colors} />;
}

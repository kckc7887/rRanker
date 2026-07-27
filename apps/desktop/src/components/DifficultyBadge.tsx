import type { Difficulty } from '@rranker/core';
import { DIFFICULTY_LABELS } from '../app/format';

export function DifficultyBadge({
  difficulty,
  compact = false,
}: {
  difficulty: Difficulty;
  compact?: boolean;
}) {
  return (
    <span
      className={`difficulty-badge difficulty-${difficulty} ${
        compact ? 'difficulty-compact' : ''
      }`}
    >
      {compact ? DIFFICULTY_LABELS[difficulty].slice(0, 3) : DIFFICULTY_LABELS[difficulty]}
    </span>
  );
}

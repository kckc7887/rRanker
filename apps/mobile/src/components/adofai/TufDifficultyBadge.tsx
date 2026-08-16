import type { StyleProp, ViewStyle } from 'react-native';
import { SPECIAL_DIFFICULTY_GRADIENT } from '@/components/special-difficulty-theme';
import { GameDifficultyBadge } from '@/components/game-content/GameDifficultyBadge';
import { tufDifficultyVisual, type TufDifficulty } from '@/domain/tuf';
import type { BadgePresentation } from '@/features/game-content/presentation';
import { useAppTheme } from '@/theme/app-theme';

const DIFFICULTY_THEME: Record<string, { background: string; border: string; text: string }> = {
  'tuf-p': { background: '#209FCB', border: '#45C9F4', text: '#FFFFFF' },
  'tuf-g': { background: '#F2A700', border: '#B87F00', text: '#172033' },
  'tuf-u': { background: '#7B4FB2', border: '#56377C', text: '#FFFFFF' },
};

export function TufDifficultyBadge({
  difficulty,
  display = 'label-and-value',
  source,
  style,
}: {
  difficulty: BadgePresentation;
  display?: 'label' | 'value' | 'label-and-value' | 'band';
  source?: Pick<TufDifficulty, 'name' | 'type' | 'color'> | null;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useAppTheme();
  const band = difficulty.label.trim().toUpperCase().match(/^([PGU])(?:\d{1,2})?$/)?.[1];
  const text = display === 'band'
    ? band ?? difficulty.label
    : display === 'label'
    ? difficulty.label
    : display === 'value'
      ? difficulty.value ?? '—'
      : `${difficulty.label}${difficulty.value ? ` · ${difficulty.value}` : ''}`;
  const accessibilityLabel = `难度 ${difficulty.label}${difficulty.value ? `，基准分 ${difficulty.value}` : ''}`;
  const visual = tufDifficultyVisual(source ?? {
    name: difficulty.label,
    type: band ? 'PGU' : 'SPECIAL',
    color: null,
  });
  const colors = visual ?? DIFFICULTY_THEME[difficulty.tone] ?? {
    background: theme.surfaceMuted,
    border: theme.border,
    text: theme.textSecondary,
  };
  return <GameDifficultyBadge
    accessibilityLabel={accessibilityLabel}
    clipped
    fallbackTextColor="#FFFFFF"
    special={!visual && difficulty.tone === 'tuf-special' ? { gradient: SPECIAL_DIFFICULTY_GRADIENT } : undefined}
    style={style ?? null}
    text={text}
    theme={colors}
  />;
}

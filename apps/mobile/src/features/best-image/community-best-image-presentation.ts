import { SPECIAL_DIFFICULTY_GRADIENT } from '@/components/special-difficulty-theme';
import { museDashRankBadge, type MuseDashRawScore } from '@/domain/muse-dash';
import { MUSE_DASH_ACC_GRADIENTS, museDashAccGradientKind } from '@/domain/musedash-acc-theme';
import { museDashLevelTheme } from '@/domain/musedash-level-theme';
import { museDashMetalGradient, museDashToneColor } from '@/domain/musedash-tone-theme';
import { tufDifficultyVisual, type TufPass } from '@/domain/tuf';
import {
  BADGE_LAYER_OVERLAY,
  BEST_IMAGE_RAINBOW_TEXT,
  STATUS_BADGE_THEMES,
  layeredBadgeCssBackground,
} from './best-image-badge-theme';
import type {
  ApplicationBestImageBadgePresentation,
  ApplicationBestImageCardPresentation,
} from './application-best-image-card';
import { formatMuseDashAcc, formatTufAccuracy, presentMuseDashScore, presentTufScore } from '@/features/game-content/adapters';

function solidBadge(key: string, label: string, color: string): ApplicationBestImageBadgePresentation {
  return { key, label, background: color, border: color, text: '#FFFFFF' };
}

function metalBadge(
  key: string,
  label: string,
  kind: 'gold' | 'silver',
): ApplicationBestImageBadgePresentation {
  const metal = museDashMetalGradient(kind);
  return {
    key,
    label,
    background: [
      `linear-gradient(${BADGE_LAYER_OVERLAY},${BADGE_LAYER_OVERLAY}) padding-box`,
      `linear-gradient(90deg,${metal.fill.join(',')}) padding-box`,
      `linear-gradient(90deg,${metal.border.join(',')}) border-box`,
    ].join(','),
    border: 'transparent',
    text: metal.text,
  };
}

function museDashBadge(
  key: string,
  label: string,
  tone: string,
): ApplicationBestImageBadgePresentation {
  if (tone === 'acc-gold' || tone === 'achievement-ap' || tone === 'rank-gold') {
    return metalBadge(key, label, 'gold');
  }
  if (tone === 'acc-silver') return metalBadge(key, label, 'silver');
  if (tone === 'rank-rainbow') {
    return {
      key,
      label,
      background: layeredBadgeCssBackground('rainbow'),
      border: 'transparent',
      text: BEST_IMAGE_RAINBOW_TEXT,
    };
  }
  return solidBadge(key, label, museDashToneColor(tone) ?? STATUS_BADGE_THEMES.neutral.background);
}

function neutralBadge(key: string, label: string): ApplicationBestImageBadgePresentation {
  const theme = STATUS_BADGE_THEMES.neutral;
  return { key, label, background: theme.background, border: theme.border, text: theme.text };
}

export function presentMuseDashApplicationBestImageCard(
  score: MuseDashRawScore,
  miss: number | undefined,
  coverUri: string | null,
): ApplicationBestImageCardPresentation {
  const presentation = presentMuseDashScore(score, { detail: { play: { miss } } });
  const theme = museDashLevelTheme(score.play.difficulty);
  const achievement = presentation.achievementRows.flat().find((badge) => badge.key === 'achievement');
  const rank = museDashRankBadge(score.play.i ?? score.play.history?.lastRank ?? 0);
  const firstRow = [
    presentation.grade ? museDashBadge('grade', presentation.grade.label, presentation.grade.tone) : null,
    achievement ? museDashBadge(achievement.key, achievement.label, achievement.tone) : null,
    rank ? museDashBadge('rank', rank.label, rank.tone) : null,
  ].filter((badge): badge is ApplicationBestImageBadgePresentation => badge !== null);
  const secondRow = [
    score.characterName ? neutralBadge('character', score.characterName) : null,
    score.elfinName ? neutralBadge('elfin', score.elfinName) : null,
    neutralBadge('platform', (score.play.platform ?? 'mobile') === 'pc' ? 'PC 端' : '移动端'),
  ].filter((badge): badge is ApplicationBestImageBadgePresentation => badge !== null);
  const accGradient = museDashAccGradientKind(score.play.acc);
  return {
    key: `${score.play.uid}:${score.play.difficulty}`,
    accessibilityLabel: presentation.accessibilityLabel,
    identifier: `ID${score.play.uid}`,
    title: presentation.title,
    coverUri,
    palette: {
      background: theme.background,
      border: theme.border,
      text: theme.text,
      mutedText: theme.text,
      faintText: theme.text,
      separator: theme.text,
      jacketBorder: theme.border,
    },
    primary: {
      text: formatMuseDashAcc(score.play.acc),
      textBackground: accGradient ? `linear-gradient(90deg,${MUSE_DASH_ACC_GRADIENTS[accGradient].join(',')})` : undefined,
    },
    relation: {
      text: `${score.constant == null ? '—' : score.constant.toFixed(2)} → ${score.play.sum == null ? '—' : String(score.play.sum)}`,
    },
    badgeRows: [firstRow, secondRow],
  };
}

export function presentTufApplicationBestImageCard(
  pass: TufPass,
  coverUri: string,
  tagIcons: Readonly<Record<string, string | null>>,
): ApplicationBestImageCardPresentation {
  const presentation = presentTufScore(pass);
  const visual = tufDifficultyVisual(pass.level.difficulty);
  const special = !visual && !!pass.level.difficulty
    && pass.level.difficulty.name.trim().toUpperCase() !== 'UNRANKED';
  const background = visual?.background ?? (special
    ? `linear-gradient(rgba(20,14,38,0.24),rgba(20,14,38,0.24)),linear-gradient(90deg,${SPECIAL_DIFFICULTY_GRADIENT.join(',')})`
    : '#374151');
  const text = visual?.text ?? '#FFFFFF';
  const metricTheme = STATUS_BADGE_THEMES.normal;
  const metricBadges: ApplicationBestImageBadgePresentation[] = [
    { key: 'xacc', label: formatTufAccuracy(pass.accuracy), background: metricTheme.background, border: metricTheme.border, text: metricTheme.text },
    { key: 'speed', label: `${pass.speed.toFixed(2)}×`, background: metricTheme.background, border: metricTheme.border, text: metricTheme.text },
    ...(pass.isWorldsFirst ? [{ key: 'wf', label: 'WF', background: layeredBadgeCssBackground('gold'), border: 'transparent', text: BEST_IMAGE_RAINBOW_TEXT }] : []),
    ...(pass.isWorldsFirstPP ? [{ key: 'pp', label: 'PP', background: layeredBadgeCssBackground('gold'), border: 'transparent', text: BEST_IMAGE_RAINBOW_TEXT }] : []),
  ];
  const iconRow = pass.level.tags.flatMap((tag) => {
    const name = typeof tag === 'string' ? tag : tag.name;
    const source = tagIcons[name];
    return source ? [{ key: name, label: name, source }] : [];
  });
  return {
    key: String(pass.id),
    accessibilityLabel: presentation.accessibilityLabel,
    identifier: `ID${pass.levelId}`,
    title: presentation.title,
    coverUri,
    palette: {
      background,
      border: visual?.border ?? (special ? SPECIAL_DIFFICULTY_GRADIENT[0] : '#374151'),
      text,
      mutedText: text,
      faintText: text,
      separator: text,
      jacketBorder: text,
    },
    primary: { label: 'Score', text: pass.scoreV2.toFixed(2) },
    relation: {
      text: `${presentation.difficulty.label} → ${pass.impact == null ? '—' : pass.impact.toFixed(2)}`,
    },
    iconRow,
    badgeRows: [metricBadges],
  };
}

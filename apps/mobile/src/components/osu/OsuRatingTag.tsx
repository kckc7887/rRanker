import { TintedRatingTag } from '@/components/TintedRatingTag';
import type { DxRatingTheme } from '@/domain/dx-rating-theme';

export const OSU_PP_RATING_THEME: DxRatingTheme = {
  id: 'osu-pp',
  label: 'PP',
  fillColors: ['#F57FA0', '#F05785'],
  fillLocations: [0, 1],
  borderColors: ['#C03862', '#8E2447'],
  borderLocations: [0, 1],
  overlayColor: 'rgba(75,78,85,0.10)',
  textColor: '#FFFFFF',
  starColor: '#FFE3EC',
  starCount: 0,
};

export function OsuRatingTag({ display }: { display: string }) {
  return (
    <TintedRatingTag
      accessibilityLabel={`PP ${display}`}
      display={display}
      testID="osu-pp-tag"
      theme={OSU_PP_RATING_THEME}
    />
  );
}

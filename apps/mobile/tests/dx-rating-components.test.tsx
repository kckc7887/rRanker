import { resolveDxRatingTheme } from '@rranker/game-maimai/domain/dx-rating-theme';

import { render } from '@testing-library/react-native';
import { RatingCard } from '@rranker/sdk/components/RatingCard';
import { DxRatingTag } from '@rranker/game-maimai/components/DxRatingTag';
import { resolvePhigrosChallengeTheme } from '@rranker/game-phigros/domain/phigros-challenge-theme';
import {
  resolveChunithmPossessionTheme,
  resolveChunithmRatingTier,
} from '@rranker/game-chunithm/domain/chunithm-rating-theme';

describe('DX Rating components', () => {
  it('shows the rating tier and stars', async () => {
    const screen = await render(<RatingCard label="DX RATING" display="16750" meta="测试玩家" themeOverride={resolveDxRatingTheme(16750)} />);
    expect(screen.getByTestId('dx-rating-card-stars')).toHaveTextContent('★★★★');
    expect(screen.queryByTestId('dx-rating-medal')).toBeNull();
    expect(screen.getByLabelText(/档位 彩极/)).toBeTruthy();
  });

  it('shows the numeric account rating and tier stars', async () => {
    const low = await render(<DxRatingTag rating={500} display="00500" />);
    expect(low.getByText('500')).toBeTruthy();
    expect(low.queryByText('00500')).toBeNull();

    const platinum = await render(<DxRatingTag rating={14500} display="14500" />);
    expect(platinum.getByTestId('dx-rating-tag-stars')).toHaveTextContent('★');
  });

  it('keeps empty accounts neutral and displays a dash', async () => {
    const screen = await render(<DxRatingTag rating={null} display="—" />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByTestId('dx-rating-tag-stars')).toBeNull();
  });

  it('supports Phigros challenge badge on the right side', async () => {
    const screen = await render(
      <RatingCard
        label="Raking Score"
        display="16.1266"
        meta="B27 14.81 · Phi3 15.00"
        themeOverride={resolvePhigrosChallengeTheme(442)}
        sideBadge={{ title: '课题模式', value: '42' }}
      />,
    );
    expect(screen.getByText('课题模式')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.queryByTestId('dx-rating-card-stars')).toBeNull();
  });

  it('shows the Chunithm rating tier and possession', async () => {
    const possessionTheme = resolveChunithmPossessionTheme('rainbow');
    const screen = await render(
      <RatingCard
        borderless
        label="RATING"
        display="17.25"
        meta="Best30 17.20 · New20 17.30"
        themeOverride={possessionTheme}
        valueTheme={resolveChunithmRatingTier(17.25)}
      />,
    );
    expect(screen.getByLabelText(/档位 虹，背景 虹领域/)).toBeTruthy();
    expect(screen.queryByTestId('dx-rating-card-stars')).toBeNull();
  });
});

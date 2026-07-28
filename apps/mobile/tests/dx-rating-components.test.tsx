import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { DxRatingCard } from '@/components/DxRatingCard';
import { DxRatingTag } from '@/components/DxRatingTag';
import { resolvePhigrosChallengeTheme } from '@/domain/phigros-challenge-theme';
import {
  resolveChunithmPossessionTheme,
  resolveChunithmRatingTier,
} from '@/domain/chunithm-rating-theme';

describe('DX Rating components', () => {
  it('shows tier stars on the overview card without the old medal dot', async () => {
    const screen = await render(<DxRatingCard label="DX RATING" display="16750" meta="测试玩家" rating={16750} />);
    expect(screen.getByTestId('dx-rating-card-stars').props.children).toBe('★★★★');
    expect(screen.queryByTestId('dx-rating-medal')).toBeNull();
    expect(screen.getByLabelText(/档位 彩极/)).toBeTruthy();
  });

  it('uses an unpadded rounded-rectangle account tag with stars', async () => {
    const low = await render(<DxRatingTag rating={500} display="00500" />);
    expect(low.getByText('500')).toBeTruthy();
    expect(low.queryByText('00500')).toBeNull();

    const platinum = await render(<DxRatingTag rating={14500} display="14500" />);
    expect(platinum.getByTestId('dx-rating-tag-stars').props.children).toBe('★');
  });

  it('keeps empty accounts neutral and displays a dash', async () => {
    const screen = await render(<DxRatingTag rating={null} display="—" />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByTestId('dx-rating-tag-stars')).toBeNull();
  });

  it('supports Phigros challenge badge on the right side', async () => {
    const screen = await render(
      <DxRatingCard
        label="Raking Score"
        display="16.1266"
        meta="B27 14.81 · Phi3 15.00"
        rating={16.1266}
        themeOverride={resolvePhigrosChallengeTheme(442)}
        sideBadge={{ title: '课题模式', value: '42' }}
      />,
    );
    expect(screen.getByText('课题模式')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.queryByTestId('dx-rating-card-stars')).toBeNull();
  });

  it('renders Chunithm possession background and rainbow Rating independently', async () => {
    const possessionTheme = resolveChunithmPossessionTheme('rainbow');
    const screen = await render(
      <DxRatingCard
        borderless
        label="RATING"
        display="17.25"
        meta="Best30 17.20 · New20 17.30"
        rating={17.25}
        themeOverride={possessionTheme}
        valueTheme={resolveChunithmRatingTier(17.25)}
      />,
    );
    expect(screen.getByTestId('dx-rating-card-value-gradient')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('dx-rating-card-value').props.style))
      .toMatchObject({ color: possessionTheme.textColor });
    expect(StyleSheet.flatten(screen.getByTestId('dx-rating-card-borderless').props.style))
      .toMatchObject({ borderRadius: 18, padding: 0 });
    expect(StyleSheet.flatten(screen.getByTestId('dx-rating-card-inner-borderless').props.style))
      .toMatchObject({ borderRadius: 18, padding: 22 });
    expect(screen.getByLabelText(/档位 虹，背景 虹领域/)).toBeTruthy();
    expect(screen.queryByTestId('dx-rating-card-stars')).toBeNull();
  });

  it('uses the card text color as the Rating fill and a solid tier color as its outline', async () => {
    const possessionTheme = resolveChunithmPossessionTheme('gold');
    const tierTheme = resolveChunithmRatingTier(14.5);
    const screen = await render(
      <DxRatingCard
        borderless
        label="RATING"
        display="14.50"
        meta="Best30 14.50 · New20 14.50"
        rating={14.5}
        themeOverride={possessionTheme}
        valueTheme={tierTheme}
      />,
    );

    expect(StyleSheet.flatten(screen.getByTestId('dx-rating-card-value').props.style))
      .toMatchObject({ color: possessionTheme.textColor });
    expect(screen.getByTestId('dx-rating-card-value-outline-solid').props.children)
      .toHaveLength(8);
  });
});

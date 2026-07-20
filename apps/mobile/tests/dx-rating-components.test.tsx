import { render } from '@testing-library/react-native';
import { DxRatingCard } from '@/components/DxRatingCard';
import { DxRatingTag } from '@/components/DxRatingTag';
import { resolvePhigrosChallengeTheme } from '@/domain/phigros-challenge-theme';

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
});

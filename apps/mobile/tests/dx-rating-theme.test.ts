import { resolveDxRatingTheme } from '@/domain/dx-rating-theme';

describe('resolveDxRatingTheme', () => {
  it('maps every supplied color boundary to the expected family', () => {
    const tiers = [
      [0, 'white'], [1000, 'blue'], [2000, 'green'], [4000, 'yellow'],
      [7000, 'red'], [10000, 'purple'], [12000, 'bronze'], [13000, 'silver'],
      [14000, 'gold'], [14500, 'platinum'], [15000, 'rainbow'], [16000, 'extreme'],
    ] as const;
    tiers.forEach(([boundary, id], index) => {
      expect(resolveDxRatingTheme(boundary).id).toBe(id);
      if (index > 0) expect(resolveDxRatingTheme(boundary - 1).id).toBe(tiers[index - 1]?.[1]);
    });
    expect(resolveDxRatingTheme(17000).id).toBe('extreme');
  });

  it('assigns preview.html star counts at every 250-point boundary', () => {
    expect(resolveDxRatingTheme(11999).starCount).toBe(0);
    expect(resolveDxRatingTheme(14000).starCount).toBe(1);
    expect(resolveDxRatingTheme(14249).starCount).toBe(1);
    expect(resolveDxRatingTheme(14250).starCount).toBe(2);
    expect(resolveDxRatingTheme(14499).starCount).toBe(2);
    expect(resolveDxRatingTheme(14500).starCount).toBe(1);
    expect(resolveDxRatingTheme(14749).starCount).toBe(1);
    expect(resolveDxRatingTheme(14750).starCount).toBe(2);
    expect(resolveDxRatingTheme(14999).starCount).toBe(2);
    expect(resolveDxRatingTheme(15000).starCount).toBe(1);
    expect(resolveDxRatingTheme(15250).starCount).toBe(2);
    expect(resolveDxRatingTheme(15500).starCount).toBe(3);
    expect(resolveDxRatingTheme(15750).starCount).toBe(4);
    expect(resolveDxRatingTheme(15999).starCount).toBe(4);
    expect(resolveDxRatingTheme(16000).starCount).toBe(1);
    expect(resolveDxRatingTheme(16249).starCount).toBe(1);
    expect(resolveDxRatingTheme(16250).starCount).toBe(2);
    expect(resolveDxRatingTheme(16499).starCount).toBe(2);
    expect(resolveDxRatingTheme(16500).starCount).toBe(3);
    expect(resolveDxRatingTheme(16749).starCount).toBe(3);
    expect(resolveDxRatingTheme(16750).starCount).toBe(4);
    expect(resolveDxRatingTheme(99999).starCount).toBe(4);
  });

  it('uses the exact supplied gradients for key tiers', () => {
    expect(resolveDxRatingTheme(14500)).toMatchObject({
      fillColors: ['#FFF9EC', '#F1DDB1', '#FFF8E9', '#F5E9CC'],
      borderColors: ['#D9BC7F', '#B99A55'],
      textColor: '#4A3B1E',
    });
    expect(resolveDxRatingTheme(16000)).toMatchObject({
      fillColors: ['#FFFEFD', '#F8FBFF', '#EFFBFF', '#F6F1FF', '#FFF7FB'],
      starColor: '#8B79C8',
    });
  });
});

import { resolveDxRatingTheme } from '@/domain/dx-rating-theme';

describe('resolveDxRatingTheme', () => {
  it('maps boundary values to the expected plate family', () => {
    expect(resolveDxRatingTheme(0).id).toBe('white-blue');
    expect(resolveDxRatingTheme(999).id).toBe('white-blue');
    expect(resolveDxRatingTheme(1000).id).toBe('blue');
    expect(resolveDxRatingTheme(2000).id).toBe('green');
    expect(resolveDxRatingTheme(4000).id).toBe('orange');
    expect(resolveDxRatingTheme(7000).id).toBe('red');
    expect(resolveDxRatingTheme(10000).id).toBe('purple');
    expect(resolveDxRatingTheme(12000).id).toBe('bronze');
    expect(resolveDxRatingTheme(13000).id).toBe('silver');
    expect(resolveDxRatingTheme(14000).id).toBe('gold');
    expect(resolveDxRatingTheme(15000).id).toBe('rainbow');
    expect(resolveDxRatingTheme(16000).id).toBe('prism');
    expect(resolveDxRatingTheme(17000).id).toBe('prism');
  });

  it('assigns medal tones inside gold / rainbow bands', () => {
    expect(resolveDxRatingTheme(14000).medal).toBe('green');
    expect(resolveDxRatingTheme(14250).medal).toBe('orange');
    expect(resolveDxRatingTheme(14500).medal).toBe('red');
    expect(resolveDxRatingTheme(14750).medal).toBe('purple');
    expect(resolveDxRatingTheme(15500).medal).toBe('red');
    expect(resolveDxRatingTheme(16750).medal).toBe('purple');
    expect(resolveDxRatingTheme(11999).medal).toBe('none');
  });
});

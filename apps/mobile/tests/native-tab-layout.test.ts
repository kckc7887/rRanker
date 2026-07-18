import { describe, expect, it } from 'vitest';

import { getNativeTabBottomInset } from '@/navigation/native-tab-layout';

describe('native tab content inset', () => {
  it('does not duplicate the automatic iOS native-tab content inset', () => {
    expect(getNativeTabBottomInset('ios', 34)).toBe(0);
  });

  it('reserves the Android Material navigation bar and device safe area', () => {
    expect(getNativeTabBottomInset('android', 24)).toBe(104);
  });

  it('does not add a mobile tab inset on web', () => {
    expect(getNativeTabBottomInset('web', 20)).toBe(0);
  });

  it('clamps invalid negative Android safe-area values', () => {
    expect(getNativeTabBottomInset('android', -10)).toBe(80);
  });
});

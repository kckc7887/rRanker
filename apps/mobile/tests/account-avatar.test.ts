import { describe, expect, it } from 'vitest';
import {
  buildLxnsIconUrl,
} from '@/domain/account-avatar';

describe('account avatar urls', () => {
  it('buildLxnsIconUrl maps icon id to LXNS asset path', () => {
    expect(buildLxnsIconUrl(200201)).toBe(
      'https://assets2.lxns.net/maimai/icon/200201.png',
    );
    expect(buildLxnsIconUrl(undefined)).toBeNull();
  });
});

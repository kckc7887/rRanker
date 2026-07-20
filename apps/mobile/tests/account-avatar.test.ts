import { describe, expect, it } from 'vitest';
import {
  buildLxnsIconUrl,
  buildPhigrosAvatarUrl,
} from '@/domain/account-avatar';

describe('account avatar urls', () => {
  it('buildPhigrosAvatarUrl follows OSS release avatar layout', () => {
    expect(buildPhigrosAvatarUrl('3.19.4', 'Glaciaxion')).toBe(
      'https://rranker-phigros-data.cn-nb1.rains3.com/phigros/releases/3.19.4/avatars/Glaciaxion.png',
    );
    expect(buildPhigrosAvatarUrl('3.19.4', 'Artificial Existence头像')).toBe(
      'https://rranker-phigros-data.cn-nb1.rains3.com/phigros/releases/3.19.4/avatars/Artificial%20Existence%E5%A4%B4%E5%83%8F.png',
    );
  });

  it('buildLxnsIconUrl maps icon id to LXNS asset path', () => {
    expect(buildLxnsIconUrl(200201)).toBe(
      'https://assets2.lxns.net/maimai/icon/200201.png',
    );
    expect(buildLxnsIconUrl(undefined)).toBeNull();
  });
});

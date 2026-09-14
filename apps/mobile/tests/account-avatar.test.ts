import { describe, expect, it } from 'vitest';
import {
  buildLxnsIconUrl,
  buildPhigrosAvatarUrl,
  phigrosReleaseDirectory,
} from '@/domain/account-avatar';

describe('account avatar urls', () => {
  it('phigrosReleaseDirectory uses the manifest object prefix', () => {
    expect(phigrosReleaseDirectory('phigros/releases/3.19.4/manifest.json')).toBe('phigros/releases/3.19.4/');
    expect(phigrosReleaseDirectory('phigros/releases/3.19.4-deadbeef/manifest.json')).toBe('phigros/releases/3.19.4-deadbeef/');
  });

  it('buildPhigrosAvatarUrl follows OSS release avatar layout', () => {
    expect(buildPhigrosAvatarUrl('phigros/releases/3.19.4/', 'Glaciaxion')).toBe(
      'https://rranker-phigros-data.cn-nb1.rains3.com/phigros/releases/3.19.4/avatars/Glaciaxion.png',
    );
    expect(buildPhigrosAvatarUrl('phigros/releases/3.19.4-deadbeef', 'Artificial Existence头像', '3.19.4-deadbeef')).toBe(
      'https://rranker-phigros-data.cn-nb1.rains3.com/phigros/releases/3.19.4-deadbeef/avatars/Artificial%20Existence%E5%A4%B4%E5%83%8F.png?v=3.19.4-deadbeef',
    );
  });

  it('buildLxnsIconUrl maps icon id to LXNS asset path', () => {
    expect(buildLxnsIconUrl(200201)).toBe(
      'https://assets2.lxns.net/maimai/icon/200201.png',
    );
    expect(buildLxnsIconUrl(undefined)).toBeNull();
  });
});

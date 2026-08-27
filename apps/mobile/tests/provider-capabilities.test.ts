import {
  canReadChunithmScores,
  canReadPhigrosScores,
  shouldPersistMaimaiCatalog,
  shouldPersistScoreSnapshot,
} from '@/domain/provider-capabilities';

describe('canReadPhigrosScores', () => {
  it('放行 Phigros 示例账号且不要求会话', () => {
    expect(canReadPhigrosScores('phigros-test', null)).toBe(true);
    expect(canReadPhigrosScores('phigros-test', undefined)).toBe(true);
  });

  it('仅当存在 phi-session 时放行 TapTap 云存档', () => {
    expect(canReadPhigrosScores('phi-taptap', 'phi-session')).toBe(true);
    expect(canReadPhigrosScores('phi-taptap', null)).toBe(false);
    expect(canReadPhigrosScores('phi-taptap', 'import-token')).toBe(false);
  });

  it('拒绝其他游戏 Provider 与未绑定状态', () => {
    expect(canReadPhigrosScores(null, null)).toBe(false);
    expect(canReadPhigrosScores('maimai-test', null)).toBe(false);
    expect(canReadPhigrosScores('chunithm-test', null)).toBe(false);
    expect(canReadPhigrosScores('diving-fish', 'diving-fish-session')).toBe(false);
    expect(canReadPhigrosScores('lxns', 'lxns-oauth')).toBe(false);
  });
});

describe('canReadChunithmScores', () => {
  it('保持示例账号与落雪会话放行行为', () => {
    expect(canReadChunithmScores('chunithm-test', null)).toBe(true);
    expect(canReadChunithmScores('lxns', 'lxns-oauth')).toBe(true);
    expect(canReadChunithmScores('phigros-test', null)).toBe(false);
    expect(canReadChunithmScores('phi-taptap', 'phi-session')).toBe(false);
  });
});

describe('快照持久化能力', () => {
  it('示例账号与 Phigros 云存档不写成绩快照', () => {
    expect(shouldPersistScoreSnapshot(null)).toBe(false);
    expect(shouldPersistScoreSnapshot('chunithm-test')).toBe(false);
    expect(shouldPersistScoreSnapshot('phi-taptap')).toBe(false);
    expect(shouldPersistScoreSnapshot('phigros-test')).toBe(true);
    expect(shouldPersistScoreSnapshot('diving-fish')).toBe(true);
  });

  it('曲库快照对任意 Provider 均持久化', () => {
    expect(shouldPersistMaimaiCatalog(null)).toBe(false);
    expect(shouldPersistMaimaiCatalog('diving-fish')).toBe(false);
    expect(shouldPersistMaimaiCatalog('phigros-test')).toBe(false);
  });
});

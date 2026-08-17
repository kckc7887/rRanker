import {
  boundModesOfCredential,
  familyForGameId,
  familyForId,
  isOsuGameId,
  OSU_FAMILY,
} from '@/domain/game-mode-family';
import {
  reusablePartiallyBoundAccounts,
  reusableSharedCredentialAccounts,
} from '@/domain/shared-credential-account-reuse';
import { createOsuBoundAccount } from '@/domain/bound-account';
import { reusableLxnsAccounts } from '@/domain/lxns-account-reuse';
import type { BoundAccount } from '@/domain/bound-account';

const osuSession = {
  mode: 'osu-oauth',
  accessToken: 'a',
  refreshToken: 'r',
  expiresAt: 9999999999999,
  persistable: true,
} as const;

function osuAccount(gameId: 'osu-standard' | 'osu-mania' | 'osu-catch' | 'osu-taiko', userId: number): BoundAccount {
  return createOsuBoundAccount({ gameId, userId, displayName: `玩家${userId}`, pp: 100 });
}

describe('多模式游戏家族公共逻辑', () => {
  it('familyForGameId 只命中家族成员', () => {
    expect(familyForGameId('osu-standard')?.id).toBe('osu');
    expect(familyForGameId('osu-mania')?.id).toBe('osu');
    expect(familyForGameId('maimai')).toBeNull();
  });

  it('familyForId 命中注册表', () => {
    expect(familyForId('osu')?.title).toBe('osu!');
    expect(familyForId('unknown')).toBeNull();
  });

  it('isOsuGameId 判定四个模式', () => {
    expect(isOsuGameId('osu-standard')).toBe(true);
    expect(isOsuGameId('osu-catch')).toBe(true);
    expect(isOsuGameId('musedash')).toBe(false);
  });

  it('boundModesOfCredential 按凭据推导已绑模式', () => {
    const accounts = [
      osuAccount('osu-standard', 1),
      osuAccount('osu-mania', 1),
      osuAccount('osu-catch', 2),
    ];
    const credentialIds = {
      [accounts[0].id]: 'osu:shared-1',
      [accounts[1].id]: 'osu:shared-1',
      [accounts[2].id]: 'osu:shared-2',
    };
    expect([...boundModesOfCredential(accounts, credentialIds, 'osu:shared-1')].sort()).toEqual(['osu-mania', 'osu-standard']);
  });

  it('reusablePartiallyBoundAccounts 只列出未绑全模式的凭据并去重', () => {
    const full = [osuAccount('osu-standard', 1), osuAccount('osu-mania', 1), osuAccount('osu-catch', 1), osuAccount('osu-taiko', 1)];
    const partial = [osuAccount('osu-standard', 2), osuAccount('osu-mania', 2)];
    const accounts = [...full, ...partial];
    const credentialIds = {
      [full[0].id]: 'osu:full',
      [full[1].id]: 'osu:full',
      [full[2].id]: 'osu:full',
      [full[3].id]: 'osu:full',
      [partial[0].id]: 'osu:partial',
      [partial[1].id]: 'osu:partial',
    };
    const sessions = {
      [full[0].id]: osuSession,
      [partial[0].id]: osuSession,
    };
    const reusable = reusablePartiallyBoundAccounts({
      providerId: 'osu',
      sessionMode: 'osu-oauth',
      familyModeGameIds: OSU_FAMILY.modeGameIds,
      accounts,
      sessionsByAccountId: sessions,
      credentialIdsByAccountId: credentialIds,
    });
    expect(reusable).toHaveLength(1);
    expect(reusable[0].displayName).toBe('玩家2');
  });

  it('reusableSharedCredentialAccounts 排除已绑目标与凭据缺失', () => {
    const target = osuAccount('osu-standard', 1);
    const sibling = osuAccount('osu-mania', 1);
    const accounts = [target, sibling];
    const reusable = reusableSharedCredentialAccounts({
      providerId: 'osu',
      sessionMode: 'osu-oauth',
      targetGameId: 'osu-standard',
      siblingGameIds: OSU_FAMILY.modeGameIds,
      accounts,
      sessionsByAccountId: { [sibling.id]: osuSession },
      credentialIdsByAccountId: { [target.id]: 'osu:x', [sibling.id]: 'osu:x' },
    });
    expect(reusable).toHaveLength(0);
  });

  it('落雪复用薄包装与公共逻辑行为一致', () => {
    const maimai = {
      id: 'maimai:lxns:1', gameId: 'maimai' as const, providerId: 'lxns' as const,
      displayName: '玩家', scoreLabel: 'DX RATING', scoreDisplay: '15000', providerTitle: '落雪查分器',
    };
    const chunithm = {
      id: 'chunithm:lxns:1', gameId: 'chunithm' as const, providerId: 'lxns' as const,
      displayName: '玩家', scoreLabel: 'RATING', scoreDisplay: '15.00', providerTitle: '落雪查分器',
    };
    const lxnsSession = {
      mode: 'lxns-oauth', accessToken: 'a', refreshToken: 'r',
      expiresAt: 9999999999999, persistable: true,
    } as const;
    const result = reusableLxnsAccounts({
      targetGameId: 'chunithm',
      accounts: [maimai, chunithm],
      sessionsByAccountId: { [maimai.id]: lxnsSession, [chunithm.id]: lxnsSession },
      credentialIdsByAccountId: { [maimai.id]: 'lxns:x', [chunithm.id]: 'lxns:x' },
    });
    expect(result).toHaveLength(0);
    const reusable = reusableLxnsAccounts({
      targetGameId: 'chunithm',
      accounts: [maimai],
      sessionsByAccountId: { [maimai.id]: lxnsSession },
      credentialIdsByAccountId: { [maimai.id]: 'lxns:x' },
    });
    expect(reusable).toHaveLength(1);
    expect(reusable[0].gameId).toBe('maimai');
  });
});

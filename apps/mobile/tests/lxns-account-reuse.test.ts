import {
  createChunithmBoundAccount,
  createMaimaiBoundAccount,
} from '@/domain/bound-account';
import { reusableLxnsAccounts } from '@/domain/lxns-account-reuse';

const oauth = {
  mode: 'lxns-oauth',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 60_000,
  persistable: true,
} as const;

describe('reusableLxnsAccounts', () => {
  it('offers a Maimai credential to Chunithm and supports the reverse direction', () => {
    const maimai = createMaimaiBoundAccount({
      providerId: 'lxns',
      displayName: '舞萌玩家',
      rating: 15000,
      playerId: '1',
    });
    const chunithm = createChunithmBoundAccount({
      displayName: '中二玩家',
      rating: 17.25,
      playerId: '2',
    });

    expect(reusableLxnsAccounts({
      targetGameId: 'chunithm',
      accounts: [maimai],
      sessionsByAccountId: { [maimai.id]: oauth },
      credentialIdsByAccountId: { [maimai.id]: 'lxns:a' },
    })).toEqual([maimai]);
    expect(reusableLxnsAccounts({
      targetGameId: 'maimai',
      accounts: [chunithm],
      sessionsByAccountId: { [chunithm.id]: oauth },
      credentialIdsByAccountId: { [chunithm.id]: 'lxns:b' },
    })).toEqual([chunithm]);
  });

  it('deduplicates shared credentials and hides credentials already linked to the target game', () => {
    const maimai = createMaimaiBoundAccount({
      providerId: 'lxns',
      displayName: '舞萌玩家',
      rating: 15000,
      playerId: '1',
    });
    const chunithm = createChunithmBoundAccount({
      displayName: '中二玩家',
      rating: 17.25,
      playerId: '2',
    });
    expect(reusableLxnsAccounts({
      targetGameId: 'chunithm',
      accounts: [maimai, chunithm],
      sessionsByAccountId: { [maimai.id]: oauth, [chunithm.id]: oauth },
      credentialIdsByAccountId: {
        [maimai.id]: 'lxns:shared',
        [chunithm.id]: 'lxns:shared',
      },
    })).toEqual([]);
  });
});

import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { GameDataBundle } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import type { Player, ScoreSnapshot } from '@/domain/models';
import {
  invalidateAccountDataQueries,
  patchMaimaiPlayerDisplayName,
} from '@/services/invalidate-account-data';

const source = {
  kind: 'local' as const,
  label: '本地',
  updatedAt: '',
  isStale: false,
};

function makeBundle(accountId: string, displayName: string): GameDataBundle {
  const player: Player = {
    id: accountId,
    displayName,
    rating: 0,
    source,
  };
  const snapshot: ScoreSnapshot = {
    player,
    records: [],
    best50: {
      player,
      currentVersion: { id: 1, title: 'v' },
      b35: [],
      b15: [],
      unmatchedRecordCount: 0,
      rating: 0,
      generatedAt: '',
      source,
    },
    source,
    catalogSource: source,
  };
  return {
    gameId: 'maimai',
    providerId: 'local',
    profile: getGameProfile('maimai'),
    payload: {
      kind: 'maimai',
      player,
      records: [],
      bestSections: [],
      playerScore: { label: 'DX Rating', value: 0, display: '00000' },
      currentVersionTitle: 'v',
      unmatchedRecordCount: 0,
      source,
      catalogSource: source,
      snapshot,
    },
  };
}

describe('invalidateAccountDataQueries', () => {
  it.each([false, true])('refreshes account data with optional public resources: %s', async (includeGlobal) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const accountKey = ['game-data', 4, 'account-a', 'maimai'];
    const publicKey = ['detailed-catalog', 'maimai', 2];
    try {
      await client.fetchQuery({ queryKey: accountKey, queryFn: async () => 'old account' });
      await client.fetchQuery({ queryKey: publicKey, queryFn: async () => 'old catalog' });
      await invalidateAccountDataQueries(client, 'none', includeGlobal);
      await expect(client.fetchQuery({ queryKey: accountKey, queryFn: async () => 'fresh account' })).resolves.toBe('fresh account');
      await expect(client.fetchQuery({ queryKey: publicKey, queryFn: async () => 'fresh catalog' })).resolves.toBe(includeGlobal ? 'fresh catalog' : 'old catalog');
    } finally { client.clear(); }
  });
});

describe('phigros push query identity', () => {
  it('keeps two accounts apart and refetches after account invalidation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    let calls = 0;
    const keyFor = (accountId: string) => ['phigros-push-rks', accountId, 'player', 'rev', null, 0.01, 1, true] as const;
    await client.fetchQuery({
      queryKey: keyFor('account-a'),
      queryFn: async () => { calls += 1; return 'a'; },
    });
    await expect(client.fetchQuery({
      queryKey: keyFor('account-b'),
      queryFn: async () => { calls += 1; return 'b'; },
    })).resolves.toBe('b');
    expect(calls).toBe(2);
    await client.fetchQuery({
      queryKey: keyFor('account-a'),
      queryFn: async () => { calls += 1; return 'a-again'; },
    });
    expect(calls).toBe(2);
    await invalidateAccountDataQueries(client, 'none');
    await expect(client.fetchQuery({
      queryKey: keyFor('account-a'),
      queryFn: async () => { calls += 1; return 'a-fresh'; },
    })).resolves.toBe('a-fresh');
    expect(calls).toBe(3);
  });
});

describe('patchMaimaiPlayerDisplayName', () => {
  it('updates only the matching account game-data cache', () => {
    const client = new QueryClient();
    client.setQueryData(
      ['game-data', 4, 'maimai:local:a', 'maimai', 'local', 'none'],
      makeBundle('maimai:local:a', '旧名'),
    );
    client.setQueryData(
      ['game-data', 4, 'maimai:local:b', 'maimai', 'local', 'none'],
      makeBundle('maimai:local:b', '旧名'),
    );

    patchMaimaiPlayerDisplayName('maimai:local:a', '新名', client);

    expect(client.getQueryData<GameDataBundle>(
      ['game-data', 4, 'maimai:local:a', 'maimai', 'local', 'none'],
    )?.payload).toMatchObject({
      kind: 'maimai',
      player: { displayName: '新名' },
      snapshot: { player: { displayName: '新名' } },
    });
    expect(client.getQueryData<GameDataBundle>(
      ['game-data', 4, 'maimai:local:b', 'maimai', 'local', 'none'],
    )?.payload).toMatchObject({
      kind: 'maimai',
      player: { displayName: '旧名' },
    });
  });
});

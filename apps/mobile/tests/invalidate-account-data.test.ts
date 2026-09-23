import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { GameDataBundle } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import type { Player, ScoreSnapshot } from '@/domain/models';
import {
  accountDataQueryKeys,
  accountScopedDataQueryKeys,
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
    additionalRating: 0,
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
  it('invalidates account data without public resources by default', async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);

    await invalidateAccountDataQueries(client);

    expect(spy.mock.calls.map((call) => call[0]?.queryKey)).toEqual(
      accountScopedDataQueryKeys().map((key) => [...key]),
    );
  });

  it('can explicitly invalidate account data and public resources', async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);

    await invalidateAccountDataQueries(client, 'active', true);

    expect(spy.mock.calls.map((call) => call[0]?.queryKey)).toEqual(
      accountDataQueryKeys().map((key) => [...key]),
    );
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

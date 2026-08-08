import {
  createLocalMaimaiAccount,
  createMaimaiBoundAccount,
  createMaxedMaimaiTestAccount,
  createPhigrosBoundAccount,
  LOCAL_MAIMAI_ACCOUNT_ID,
} from '@/domain/bound-account';
import { formatPlayerScore } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import type { Player, ScoreSnapshot } from '@/domain/models';
import type { SnapshotRepository } from '@/repositories/snapshot-repository';
import { hydrateLocalAccountRatings } from '@/services/hydrate-local-account-ratings';
import { useSession } from '@/state/session-store';

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: vi.fn(async () => undefined),
    getFirstAsync: vi.fn(async () => null),
    runAsync: vi.fn(async () => undefined),
  })),
}));

const source = {
  kind: 'local' as const,
  label: '本地',
  updatedAt: '',
  isStale: false,
};

function makeSnapshot(accountId: string, rating: number): ScoreSnapshot {
  const player: Player = {
    id: accountId,
    displayName: '本地玩家',
    rating,
    additionalRating: 0,
    source,
  };
  return {
    player,
    records: [],
    best50: {
      player,
      currentVersion: { id: 1, title: 'v' },
      b35: [],
      b15: [],
      unmatchedRecordCount: 0,
      rating,
      generatedAt: '',
      source,
    },
    source,
    catalogSource: source,
  };
}

function snapshotRepository(getLatest: (accountId: string) => Promise<ScoreSnapshot | null>): SnapshotRepository {
  return {
    initialize: vi.fn(async () => undefined),
    getLatest,
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };
}

describe('hydrateLocalAccountRatings', () => {
  beforeEach(() => {
    useSession.setState({
      sessionsByAccountId: {},
      boundAccounts: [
        createLocalMaimaiAccount('本地玩家', 0),
        createLocalMaimaiAccount('第二位玩家', 0, 'maimai:local:second'),
        createMaxedMaimaiTestAccount(),
        createMaimaiBoundAccount({
          providerId: 'lxns',
          displayName: '落雪玩家',
          rating: 15000,
          playerId: 'p1',
        }),
        createPhigrosBoundAccount({ playerId: 'phi-player', rating: 15.4321 }),
      ],
      activeAccountId: LOCAL_MAIMAI_ACCOUNT_ID,
      restoreStatus: 'ready',
    });
  });

  it('pushes the real rating for every local account that has a snapshot', async () => {
    const getLatest = vi.fn(async (accountId: string) => {
      if (accountId === LOCAL_MAIMAI_ACCOUNT_ID) return makeSnapshot(accountId, 12345);
      if (accountId === 'maimai:local:second') return makeSnapshot(accountId, 23456);
      return null;
    });

    await hydrateLocalAccountRatings(snapshotRepository(getLatest));

    const accounts = useSession.getState().boundAccounts;
    expect(accounts.find((account) => account.id === LOCAL_MAIMAI_ACCOUNT_ID)?.scoreDisplay)
      .toBe(formatPlayerScore(12345, getGameProfile('maimai').ratingDigits));
    expect(accounts.find((account) => account.id === 'maimai:local:second')?.scoreDisplay)
      .toBe(formatPlayerScore(23456, getGameProfile('maimai').ratingDigits));
  });

  it('only reads snapshots for local maimai accounts', async () => {
    const getLatest = vi.fn(async () => null);

    await hydrateLocalAccountRatings(snapshotRepository(getLatest));

    expect(getLatest).toHaveBeenCalledTimes(2);
    expect(getLatest).toHaveBeenCalledWith(LOCAL_MAIMAI_ACCOUNT_ID);
    expect(getLatest).toHaveBeenCalledWith('maimai:local:second');
  });

  it('keeps the initial score display when a local account has no snapshot', async () => {
    const getLatest = vi.fn(async () => null);

    await hydrateLocalAccountRatings(snapshotRepository(getLatest));

    const accounts = useSession.getState().boundAccounts;
    expect(accounts.find((account) => account.id === LOCAL_MAIMAI_ACCOUNT_ID)?.scoreDisplay)
      .toBe(formatPlayerScore(0, getGameProfile('maimai').ratingDigits));
  });

  it('does not touch non-local accounts when hydrating', async () => {
    const getLatest = vi.fn(async () => null);

    await hydrateLocalAccountRatings(snapshotRepository(getLatest));

    const accounts = useSession.getState().boundAccounts;
    expect(accounts.find((account) => account.providerId === 'maimai-test')?.scoreDisplay)
      .toBe(createMaxedMaimaiTestAccount().scoreDisplay);
    expect(accounts.find((account) => account.providerId === 'lxns')?.scoreDisplay).toBe('15000');
    expect(accounts.find((account) => account.providerId === 'phi-taptap')?.scoreDisplay).toBe('15.4321');
  });
});

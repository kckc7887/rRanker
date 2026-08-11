import {
  createMaimaiBoundAccount,
  createMaxedChunithmTestAccount,
  createMaxedMaimaiTestAccount,
  createMaxedPhigrosTestAccount,
  createTufBoundAccount,
} from '@/domain/bound-account';
import {
  ACCOUNT_THUMBNAIL_SCHEMA_VERSION,
  accountThumbnailResourceKey,
} from '@/domain/account-thumbnail';
import {
  hydrateBoundAccountThumbnails,
  persistBoundAccountThumbnail,
} from '@/services/account-thumbnail';
import { useSession } from '@/state/session-store';
import type { Mock } from 'vitest';

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: vi.fn(async () => undefined),
    getFirstAsync: vi.fn(async () => null),
    runAsync: vi.fn(async () => undefined),
  })),
}));

function thumbnailRepository() {
  return {
    getResource: vi.fn(async (_key: string, _schemaVersion: number) => null),
    saveResource: vi.fn(async () => undefined),
  } as unknown as {
    getResource: Mock & (<T>(key: string, schemaVersion: number) => Promise<T | null>);
    saveResource: Mock & ((key: string, schemaVersion: number, updatedAt: string, value: unknown) => Promise<void>);
  };
}

describe('persistBoundAccountThumbnail', () => {
  it('writes the provided display fields under the account thumbnail key', async () => {
    const repo = thumbnailRepository();

    await persistBoundAccountThumbnail('maimai:test', {
      scoreDisplay: '15123',
      avatarUrl: 'https://example.com/a.png',
      challengeModeRank: 523,
      ratingPossession: 'rainbow',
    }, repo);

    expect(repo.saveResource).toHaveBeenCalledTimes(1);
    const [key, schemaVersion, , payload] = repo.saveResource.mock.calls[0];
    expect(key).toBe(accountThumbnailResourceKey('maimai:test'));
    expect(schemaVersion).toBe(ACCOUNT_THUMBNAIL_SCHEMA_VERSION);
    expect(payload).toEqual({
      scoreDisplay: '15123',
      avatarUrl: 'https://example.com/a.png',
      challengeModeRank: 523,
      ratingPossession: 'rainbow',
    });
  });

  it('skips null avatar and undefined fields', async () => {
    const repo = thumbnailRepository();

    await persistBoundAccountThumbnail('maimai:test', {
      scoreDisplay: '10000',
      avatarUrl: null,
    }, repo);

    expect(repo.saveResource).toHaveBeenCalledTimes(1);
    expect(repo.saveResource.mock.calls[0][3]).toEqual({ scoreDisplay: '10000' });
  });

  it('does not write when every field is empty', async () => {
    const repo = thumbnailRepository();

    await persistBoundAccountThumbnail('maimai:test', {}, repo);

    expect(repo.saveResource).not.toHaveBeenCalled();
  });
});

describe('hydrateBoundAccountThumbnails', () => {
  beforeEach(() => {
    useSession.setState({
      sessionsByAccountId: {},
      boundAccounts: [
        createMaxedMaimaiTestAccount(),
        createMaimaiBoundAccount({
          providerId: 'lxns',
          displayName: '落雪玩家',
          rating: 15000,
          playerId: 'p1',
        }),
        createMaxedChunithmTestAccount(),
        createMaxedPhigrosTestAccount(),
        createTufBoundAccount({ playerId: 1, displayName: 'TUF 玩家' }),
      ],
      activeAccountId: 'maimai:test',
      restoreStatus: 'ready',
    });
  });

  it('restores saved thumbnails for every bound account', async () => {
    const repo = thumbnailRepository();
    repo.getResource.mockImplementation(async (key: string) => {
      if (key === accountThumbnailResourceKey('maimai:test')) {
        return { scoreDisplay: '16123', avatarUrl: 'https://example.com/a.png' };
      }
      if (key === accountThumbnailResourceKey('chunithm:test')) {
        return { scoreDisplay: '16.50', ratingPossession: 'rainbow' };
      }
      if (key === accountThumbnailResourceKey('phigros:test')) {
        return { scoreDisplay: '16.5432', challengeModeRank: 560 };
      }
      if (key === accountThumbnailResourceKey('adofai:tuf:1')) {
        return { scoreDisplay: '9876.54' };
      }
      return null;
    });

    await hydrateBoundAccountThumbnails(repo);

    const accounts = useSession.getState().boundAccounts;
    expect(accounts.find((account) => account.id === 'maimai:test')?.scoreDisplay).toBe('16123');
    expect(accounts.find((account) => account.id === 'maimai:test')?.avatarUrl)
      .toBe('https://example.com/a.png');
    expect(accounts.find((account) => account.id === 'chunithm:test')?.scoreDisplay).toBe('16.50');
    expect(accounts.find((account) => account.id === 'chunithm:test')?.ratingPossession)
      .toBe('rainbow');
    expect(accounts.find((account) => account.id === 'phigros:test')?.scoreDisplay).toBe('16.5432');
    expect(accounts.find((account) => account.id === 'phigros:test')?.challengeModeRank).toBe(560);
    expect(accounts.find((account) => account.id === 'adofai:tuf:1')?.scoreDisplay).toBe('9876.54');
  });

  it('keeps the initial display when an account has no thumbnail snapshot', async () => {
    const repo = thumbnailRepository();

    await hydrateBoundAccountThumbnails(repo);

    const accounts = useSession.getState().boundAccounts;
    expect(accounts.find((account) => account.id === 'maimai:test')?.scoreDisplay)
      .toBe(createMaxedMaimaiTestAccount().scoreDisplay);
    expect(accounts.find((account) => account.id === 'chunithm:test')?.scoreDisplay)
      .toBe(createMaxedChunithmTestAccount().scoreDisplay);
    expect(accounts.find((account) => account.id === 'phigros:test')?.scoreDisplay)
      .toBe(createMaxedPhigrosTestAccount().scoreDisplay);
    expect(accounts.find((account) => account.id === 'adofai:tuf:1')?.scoreDisplay).toBe('—');
  });

  it('does not overwrite display name while hydrating thumbnails', async () => {
    const repo = thumbnailRepository();
    repo.getResource.mockResolvedValue({ scoreDisplay: '16123' });

    await hydrateBoundAccountThumbnails(repo);

    const account = useSession.getState().boundAccounts.find((item) => item.id === 'maimai:test');
    expect(account?.scoreDisplay).toBe('16123');
    expect(account?.displayName).toBe('示例账号');
  });

  it('continues when a single account read fails', async () => {
    const repo = thumbnailRepository();
    repo.getResource.mockImplementation(async (key: string) => {
      if (key === accountThumbnailResourceKey('chunithm:test')) throw new Error('db error');
      if (key === accountThumbnailResourceKey('phigros:test')) return { scoreDisplay: '16.5432' };
      return null;
    });

    await hydrateBoundAccountThumbnails(repo);

    const account = useSession.getState().boundAccounts.find((item) => item.id === 'phigros:test');
    expect(account?.scoreDisplay).toBe('16.5432');
  });

  it('reads a snapshot per bound account', async () => {
    const repo = thumbnailRepository();

    await hydrateBoundAccountThumbnails(repo);

    const boundIds = useSession.getState().boundAccounts.map((account) => account.id);
    expect(repo.getResource).toHaveBeenCalledTimes(boundIds.length);
    for (const accountId of boundIds) {
      expect(repo.getResource).toHaveBeenCalledWith(
        accountThumbnailResourceKey(accountId),
        ACCOUNT_THUMBNAIL_SCHEMA_VERSION,
      );
    }
  });
});

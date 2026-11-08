import type { CatalogSnapshot, Player, ScoreRecord } from '@rranker/game-maimai/domain/models';
import { createLocalMaimaiAccount as localAccount, createMaimaiBoundAccount as remoteAccount } from '@rranker/game-maimai/accounts';
import { useAccountStore } from '@rranker/sdk/state/account-store';
import { resolveUploadTargets } from '@rranker/tool-maimai/services/upload-maimai-from-friend-code';
import { getDataSource, setDisabledPlugins } from '@rranker/sdk/registry';
import { applyDisabledPlugins } from '@rranker/sdk/services/plugin-lifecycle';
import { invalidateResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';

const mocks = vi.hoisted(() => ({
  getPlayer: vi.fn(),
  getRecords: vi.fn(),
  saveSnapshot: vi.fn(),
}));

vi.mock('@rranker/provider-lxns/providers/lxns-score-provider', () => ({
  LxnsScoreProvider: class {
    getPlayer = mocks.getPlayer;
    getRecords = mocks.getRecords;
  },
}));
vi.mock('@rranker/game-maimai/storage/score-repository', () => ({
  ScoreRepository: class {
    save = mocks.saveSnapshot;
  },
}));

// Must be imported after provider and repository mocks.
// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import { transferMaimaiFromLxns } from '@rranker/tool-maimai/services/transfer-maimai-from-lxns';

function createLocalMaimaiAccount(...args: Parameters<typeof localAccount>) {
  const account = localAccount(...args);
  useAccountStore.getState().upsertBoundAccount(account);
  return account;
}
function createMaimaiBoundAccount(...args: Parameters<typeof remoteAccount>) {
  const account = remoteAccount(...args);
  useAccountStore.getState().upsertBoundAccount(account);
  return account;
}

const catalog: CatalogSnapshot = {
  currentVersion: { id: 1, title: '当前版本' },
  versions: [{ id: 1, title: '当前版本' }],
  songs: [{
    id: '1696',
    title: 'Test Song',
    version: '当前版本',
    charts: [{
      songId: '1696',
      type: 'DX',
      levelIndex: 3,
      level: '14',
      difficulty: 'master',
      difficultyConstant: 14,
    }],
  }],
  chartVersionIndex: { '1696:DX:3': 1 },
  source: {
    kind: 'lxns',
    label: '测试曲库',
    updatedAt: '2026-07-28T00:00:00.000Z',
    isStale: false,
  },
};

const sourcePlayer: Player = {
  id: '123456789',
  displayName: '来源玩家',
  rating: 15000,
  source: {
    kind: 'lxns',
    label: '落雪咖啡屋',
    updatedAt: '2026-07-28T00:00:00.000Z',
    isStale: false,
  },
};

const sourceRecord: ScoreRecord = {
  songId: '1696',
  title: 'Test Song',
  type: 'DX',
  levelIndex: 3,
  level: '14',
  difficulty: 'master',
  difficultyConstant: 14,
  achievements: 100.5,
  dxScore: 2000,
  rating: 320,
  fc: 'app',
  fs: 'fsdp',
  rate: 'sssp',
  version: '当前版本',
};

describe('transferMaimaiFromLxns', () => {
  afterEach(() => setDisabledPlugins([]));

  it('rejects a disabled source before reading its scores', async () => {
    const source = createMaimaiBoundAccount({ providerId: 'lxns', displayName: '来源', rating: 0, playerId: 'source' });
    const local = createLocalMaimaiAccount('目标', 0);
    const sourceSession = { mode: 'lxns-oauth' as const, accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 60_000, persistable: true as const };
    setDisabledPlugins([getDataSource('lxns')!.id]);
    await expect(transferMaimaiFromLxns({ sourceAccount: source, sourceSession,
      selected: [{ account: local, writable: true, disableReason: null }], sessionsByAccountId: {}, catalog,
    })).rejects.toThrow('账号请求已失效');
    expect(mocks.getRecords).not.toHaveBeenCalled();
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
  });

  it('rejects a stale target selection after that account has been removed', async () => {
    const source = createMaimaiBoundAccount({ providerId: 'lxns', displayName: '来源', rating: 0, playerId: 'source' });
    const local = createLocalMaimaiAccount('目标', 0);
    const sourceSession = { mode: 'lxns-oauth' as const, accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 60_000, persistable: true as const };
    useAccountStore.getState().removeBoundAccount(local.id);
    await expect(transferMaimaiFromLxns({ sourceAccount: source, sourceSession,
      selected: [{ account: local, writable: true, disableReason: null }], sessionsByAccountId: {}, catalog,
    })).rejects.toThrow('账号请求已失效');
    expect(mocks.getRecords).not.toHaveBeenCalled();
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
  });

  it('discards source scores received after its plugin was stopped and re-enabled', async () => {
    let release!: (records: ScoreRecord[]) => void;
    mocks.getRecords.mockImplementationOnce(() => new Promise<ScoreRecord[]>(yes => { release = yes; }));
    const source = createMaimaiBoundAccount({ providerId: 'lxns', displayName: '来源', rating: 0, playerId: 'source' });
    const local = createLocalMaimaiAccount('目标', 0);
    const sourceSession = { mode: 'lxns-oauth' as const, accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 60_000, persistable: true as const };
    const pending = transferMaimaiFromLxns({ sourceAccount: source, sourceSession,
      selected: [{ account: local, writable: true, disableReason: null }], sessionsByAccountId: {}, catalog,
    });
    const rejected = expect(pending).rejects.toThrow('缓存请求已失效');
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await applyDisabledPlugins([getDataSource('lxns')!.id]);
    await applyDisabledPlugins([]);
    release([sourceRecord]);
    await rejected;
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useAccountStore.setState({ boundAccounts: [], credentialsById: {}, selectedAccountId: 'unbound' });
    mocks.getPlayer.mockResolvedValue(sourcePlayer);
    mocks.getRecords.mockResolvedValue([sourceRecord]);
    mocks.saveSnapshot.mockResolvedValue(undefined);
  });

  it('reads the selected LXNS account and saves its records to a checked local target', async () => {
    const source = createMaimaiBoundAccount({
      providerId: 'lxns',
      displayName: '来源落雪',
      rating: 15000,
      playerId: 'source',
    });
    const local = createLocalMaimaiAccount('本地目标', 0);
    const sourceSession = {
      mode: 'lxns-oauth' as const,
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000,
      persistable: true as const,
    };
    const target = resolveUploadTargets([source, local], { [source.id]: sourceSession })
      .find((item) => item.account.id === local.id)!;
    const phases: string[] = [];

    const result = await transferMaimaiFromLxns({
      sourceAccount: source,
      sourceSession,
      selected: [target],
      sessionsByAccountId: { [source.id]: sourceSession },
      catalog,
      onPhase: (phase) => phases.push(phase.kind),
    });

    expect(mocks.getPlayer).toHaveBeenCalledTimes(1);
    expect(mocks.getRecords).toHaveBeenCalledTimes(1);
    expect(mocks.saveSnapshot).toHaveBeenNthCalledWith(1, source.id, expect.anything(), expect.any(Function));
    expect(mocks.saveSnapshot).toHaveBeenNthCalledWith(2, local.id, expect.anything(), expect.any(Function));
    expect(result.uploaded).toBe(1);
    expect(result.refreshedAccounts.map((item) => item.account.id)).toEqual([source.id, local.id]);
    expect(result.targetResults).toEqual([
      expect.objectContaining({ account: local, status: 'success', written: 1 }),
    ]);
    expect(phases).toEqual(['reading', 'uploading']);
  });

  it('does not write a local target deleted while the source read is pending', async () => {
    let releaseRecords: (records: ScoreRecord[]) => void = () => undefined;
    mocks.getRecords.mockReturnValue(new Promise<ScoreRecord[]>((resolve) => { releaseRecords = resolve; }));
    const source = createMaimaiBoundAccount({
      providerId: 'lxns', displayName: '来源落雪', rating: 15000, playerId: 'source',
    });
    const local = createLocalMaimaiAccount('本地目标', 0);
    const sourceSession = {
      mode: 'lxns-oauth' as const, accessToken: 'access', refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000, persistable: true as const,
    };
    const target = resolveUploadTargets([source, local], { [source.id]: sourceSession })
      .find((item) => item.account.id === local.id)!;
    const pending = transferMaimaiFromLxns({
      sourceAccount: source,
      sourceSession,
      selected: [target],
      sessionsByAccountId: { [source.id]: sourceSession },
      catalog,
    });
    invalidateResourceWrites(`account:${local.id}`);
    releaseRecords([sourceRecord]);
    const result = await pending;
    expect(mocks.saveSnapshot.mock.calls.some((call) => call[0] === local.id)).toBe(false);
    expect(result.refreshedAccounts.map((item) => item.account.id)).toEqual([source.id]);
    expect(result.targetResults).toEqual([
      expect.objectContaining({ status: 'failed', written: 0 }),
    ]);
    result.refreshedAccounts[0]?.assertCurrent?.();
    invalidateResourceWrites(`account:${local.id}`);
    expect(() => result.targetResults).not.toThrow();
  });

  it('does not write after the same local id is removed and the generation stays spent', async () => {
    let releaseRecords: (records: ScoreRecord[]) => void = () => undefined;
    mocks.getRecords.mockReturnValue(new Promise<ScoreRecord[]>((resolve) => { releaseRecords = resolve; }));
    const source = createMaimaiBoundAccount({
      providerId: 'lxns', displayName: '来源落雪', rating: 15000, playerId: 'source-2',
    });
    const local = createLocalMaimaiAccount('本地目标', 0, 'maimai:local:again');
    const sourceSession = {
      mode: 'lxns-oauth' as const, accessToken: 'access', refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000, persistable: true as const,
    };
    const pending = transferMaimaiFromLxns({
      sourceAccount: source,
      sourceSession,
      selected: [{ account: local, writable: true, disableReason: null }],
      sessionsByAccountId: { [source.id]: sourceSession },
      catalog,
    });
    invalidateResourceWrites(`account:${local.id}`);
    releaseRecords([sourceRecord]);
    const result = await pending;
    expect(mocks.saveSnapshot.mock.calls.some((call) => call[0] === local.id)).toBe(false);
    expect(result.targetResults[0]?.status).toBe('failed');
  });

  it('rejects using the source account as its own upload target', async () => {
    const source = createMaimaiBoundAccount({
      providerId: 'lxns',
      displayName: '来源落雪',
      rating: 15000,
      playerId: 'source',
    });
    const sourceSession = {
      mode: 'lxns-oauth' as const,
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000,
      persistable: true as const,
    };

    await expect(transferMaimaiFromLxns({
      sourceAccount: source,
      sourceSession,
      selected: [{ account: source, writable: true, disableReason: null }],
      sessionsByAccountId: { [source.id]: sourceSession },
      catalog,
    })).rejects.toThrow('数据来源不能同时作为上传目标');
    expect(mocks.getPlayer).not.toHaveBeenCalled();
  });
});

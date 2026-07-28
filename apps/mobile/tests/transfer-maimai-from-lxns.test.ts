import type { CatalogSnapshot, Player, ScoreRecord } from '@/domain/models';
import {
  createLocalMaimaiAccount,
  createMaimaiBoundAccount,
} from '@/domain/bound-account';
import { resolveUploadTargets } from '@/services/upload-maimai-from-friend-code';

const mocks = vi.hoisted(() => ({
  getPlayer: vi.fn(),
  getRecords: vi.fn(),
  saveSnapshot: vi.fn(),
}));

vi.mock('@/providers/lxns-score-provider', () => ({
  LxnsScoreProvider: class {
    getPlayer = mocks.getPlayer;
    getRecords = mocks.getRecords;
  },
}));
vi.mock('@/storage/sqlite-snapshot-repository', () => ({
  SqliteSnapshotRepository: class {
    save = mocks.saveSnapshot;
  },
}));

// Must be imported after provider and repository mocks.
// eslint-disable-next-line import/first
import { transferMaimaiFromLxns } from '@/services/transfer-maimai-from-lxns';

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
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(mocks.saveSnapshot).toHaveBeenNthCalledWith(1, source.id, expect.anything());
    expect(mocks.saveSnapshot).toHaveBeenNthCalledWith(2, local.id, expect.anything());
    expect(result.uploaded).toBe(1);
    expect(result.refreshedAccounts.map((item) => item.account.id)).toEqual([source.id, local.id]);
    expect(result.targetResults).toEqual([
      expect.objectContaining({ account: local, status: 'success', written: 1 }),
    ]);
    expect(phases).toEqual(['reading', 'uploading']);
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

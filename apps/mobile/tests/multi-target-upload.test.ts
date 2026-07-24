import type { CatalogSnapshot } from '@/domain/models';
import { createLocalMaimaiAccount, createMaimaiBoundAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { ProviderError } from '@/providers/errors';

const mocks = vi.hoisted(() => ({
  createFriendLoginJob: vi.fn(),
  createUpdateScoreJob: vi.fn(),
  pollLoginUntilToken: vi.fn(),
  pollUpdateScoreUntilDone: vi.fn(),
  fetchLatestSync: vi.fn(),
  loginByQrUntilToken: vi.fn(),
  bindCabinetByQr: vi.fn(),
  fetchMe: vi.fn(),
  uploadDivingFish: vi.fn(),
  saveSnapshot: vi.fn(),
  accountLoad: vi.fn(),
  accountPatch: vi.fn(),
}));

vi.mock('@/services/score-hub-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/score-hub-client')>(
    '@/services/score-hub-client',
  );
  return {
    ...actual,
    createFriendLoginJob: mocks.createFriendLoginJob,
    createUpdateScoreJob: mocks.createUpdateScoreJob,
    pollLoginUntilToken: mocks.pollLoginUntilToken,
    pollUpdateScoreUntilDone: mocks.pollUpdateScoreUntilDone,
    fetchLatestSync: mocks.fetchLatestSync,
    loginByQrUntilToken: mocks.loginByQrUntilToken,
    bindCabinetByQr: mocks.bindCabinetByQr,
    fetchMe: mocks.fetchMe,
  };
});
vi.mock('@/services/diving-fish-upload', () => ({
  uploadRecordsToDivingFish: mocks.uploadDivingFish,
}));
vi.mock('@/storage/sqlite-snapshot-repository', () => ({
  SqliteSnapshotRepository: class {
    save = mocks.saveSnapshot;
  },
}));
vi.mock('@/storage/score-hub-account-store', () => ({
  scoreHubAccountStore: {
    load: (...args: unknown[]) => mocks.accountLoad(...args),
    patch: (...args: unknown[]) => mocks.accountPatch(...args),
  },
}));

// Must be imported after the hoisted workflow mocks.
// eslint-disable-next-line import/first
import {
  QR_REQUIRES_BIND_MESSAGE,
  bindScoreHubCabinetByQr,
  resolveUploadTargets,
  uploadMaimaiFromFriendCode,
  uploadMaimaiFromQrLogin,
  uploadMaimaiWithScoreHubSession,
} from '@/services/upload-maimai-from-friend-code';

const catalog: CatalogSnapshot = {
  currentVersion: { id: 2, title: '当前版本' },
  versions: [{ id: 2, title: '当前版本' }],
  songs: [{
    id: '1696', title: 'Test Song', version: '当前版本', charts: [{
      songId: '1696', type: 'DX', levelIndex: 3, level: '14', difficulty: 'master',
      difficultyConstant: 14,
    }],
  }],
  chartVersionIndex: { '1696:DX:3': 2 },
  source: { kind: 'lxns', label: '测试曲库', updatedAt: '2026-07-17T00:00:00.000Z', isStale: false },
};

describe('好友码多目标写入', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createFriendLoginJob.mockResolvedValue({
      jobId: 'login-job', botFriendCode: null, body: { __skipAuthToken: 'hub-token' },
    });
    mocks.createUpdateScoreJob.mockResolvedValue('score-job');
    mocks.pollUpdateScoreUntilDone.mockResolvedValue(undefined);
    mocks.fetchLatestSync.mockResolvedValue({
      id: 'sync',
      scores: [{
        musicId: '11696', chartIndex: 3, type: 'dx', dxScore: 1900,
        score: '100.5%', fc: 'app', fs: 'fdxp',
      }],
    });
    mocks.saveSnapshot.mockResolvedValue(undefined);
    mocks.accountLoad.mockResolvedValue({ friendCode: '', hasCabinetBound: true });
    mocks.accountPatch.mockResolvedValue({ friendCode: '', hasCabinetBound: true });
    mocks.bindCabinetByQr.mockResolvedValue({ ok: true, alreadyBound: false });
    mocks.fetchMe.mockResolvedValue({ friendCode: '123456789012345', hasCabinetUserId: true });
  });

  it('单个目标失败不回滚已经成功的本地写入', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    const water = createMaimaiBoundAccount({
      providerId: 'diving-fish', displayName: '水鱼玩家', rating: 0, playerId: 'water',
    });
    const session: ProviderSession = {
      mode: 'import-token', value: 'import-token', persistable: true,
    };
    mocks.uploadDivingFish.mockRejectedValue(
      new ProviderError('network', '水鱼暂时不可用', true),
    );
    const phases: string[] = [];
    const result = await uploadMaimaiFromFriendCode({
      friendCode: '123456789012345',
      selectedAccountIds: [local.id, water.id],
      targets: resolveUploadTargets([local, water], { [water.id]: session }),
      sessionsByAccountId: { [water.id]: session },
      catalog,
      signal: { aborted: false },
      onPhase: (phase) => phases.push(phase.kind),
      onNeedFriendAccept: vi.fn(),
    });

    expect(mocks.fetchLatestSync).toHaveBeenCalledTimes(1);
    expect(mocks.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(result.uploaded).toBe(1);
    expect(result.targetResults).toEqual([
      expect.objectContaining({ account: local, status: 'success', written: 1 }),
      expect.objectContaining({ account: water, status: 'failed', errorMessage: '水鱼暂时不可用' }),
    ]);
    expect(phases.at(-1)).toBe('done');
  });

  it('好友码路径只传成绩，不同时绑定二维码', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    const phases: string[] = [];
    const result = await uploadMaimaiFromFriendCode({
      friendCode: '123456789012345',
      selectedAccountIds: [local.id],
      targets: resolveUploadTargets([local], {}),
      sessionsByAccountId: {},
      catalog,
      signal: { aborted: false },
      onPhase: (phase) => phases.push(phase.kind),
      onNeedFriendAccept: vi.fn(),
    });

    expect(mocks.bindCabinetByQr).not.toHaveBeenCalled();
    expect(result.uploaded).toBe(1);
    expect(phases).not.toContain('binding');
    expect(phases.at(-1)).toBe('done');
  });

  it('独立绑定仅用本地 token 走 PUT cabinet，不创建好友码登录任务', async () => {
    mocks.accountLoad.mockResolvedValue({
      friendCode: '123456789012345',
      hasCabinetBound: false,
      token: 'cached-token',
    });
    mocks.fetchMe.mockResolvedValue({
      friendCode: '123456789012345',
      hasCabinetUserId: true,
    });
    const phases: string[] = [];
    const result = await bindScoreHubCabinetByQr({
      qrCode: 'SGWCMAIDBIND',
      signal: { aborted: false },
      onPhase: (phase) => phases.push(phase.kind),
    });

    expect(mocks.createFriendLoginJob).not.toHaveBeenCalled();
    expect(mocks.bindCabinetByQr).toHaveBeenCalledWith('cached-token', 'SGWCMAIDBIND', expect.anything());
    expect(mocks.createUpdateScoreJob).not.toHaveBeenCalled();
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
    expect(mocks.accountPatch).toHaveBeenCalledWith(expect.objectContaining({
      hasCabinetBound: true,
    }));
    expect(result.alreadyBound).toBe(false);
    expect(phases).toEqual(['binding', 'done']);
  });

  it('无本地会话时绑定拒绝且不走好友码同步', async () => {
    mocks.accountLoad.mockResolvedValue({ friendCode: '', hasCabinetBound: false });
    await expect(bindScoreHubCabinetByQr({
      qrCode: 'SGWCMAIDBAD',
      signal: { aborted: false },
      onPhase: vi.fn(),
    })).rejects.toThrow(/请先到「好友码」完成一次上传/);
    expect(mocks.createFriendLoginJob).not.toHaveBeenCalled();
    expect(mocks.bindCabinetByQr).not.toHaveBeenCalled();
  });

  it('已绑定会话上传复用 token 且不创建好友申请任务', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    mocks.accountLoad.mockResolvedValue({
      friendCode: '123456789012345',
      hasCabinetBound: true,
      token: 'session-token',
    });
    mocks.fetchMe.mockResolvedValue({
      friendCode: '123456789012345',
      hasCabinetUserId: true,
    });
    const phases: string[] = [];
    const result = await uploadMaimaiWithScoreHubSession({
      expectedFriendCode: '123456789012345',
      selectedAccountIds: [local.id],
      targets: resolveUploadTargets([local], {}),
      sessionsByAccountId: {},
      catalog,
      signal: { aborted: false },
      onPhase: (phase) => phases.push(phase.kind),
    });

    expect(mocks.createFriendLoginJob).not.toHaveBeenCalled();
    expect(mocks.createUpdateScoreJob).toHaveBeenCalledWith('session-token', null, expect.anything());
    expect(result.uploaded).toBe(1);
    expect(phases).not.toContain('awaiting_friend');
    expect(phases.at(-1)).toBe('done');
  });

  it('二维码登录拿到 token 后复用同一写出链路且不传 friendshipJobId', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    mocks.loginByQrUntilToken.mockResolvedValue({
      token: 'qr-token',
      friendCode: '987654321098765',
    });
    const phases: Array<{ kind: string; authMode?: string }> = [];
    const result = await uploadMaimaiFromQrLogin({
      credential: { kind: 'text', qrCode: 'SGWCMAIDTEST' },
      selectedAccountIds: [local.id],
      targets: resolveUploadTargets([local], {}),
      sessionsByAccountId: {},
      catalog,
      signal: { aborted: false },
      onPhase: (phase) => {
        phases.push({
          kind: phase.kind,
          authMode: phase.kind === 'logging_in' ? phase.authMode : undefined,
        });
      },
    });

    expect(mocks.loginByQrUntilToken).toHaveBeenCalledTimes(1);
    expect(mocks.createUpdateScoreJob).toHaveBeenCalledWith('qr-token', null, expect.anything());
    expect(mocks.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.saveSnapshot.mock.calls[0]?.[1]?.player?.id).toBe('987654321098765');
    expect(result.uploaded).toBe(1);
    expect(phases.some((phase) => phase.kind === 'logging_in' && phase.authMode === 'qr')).toBe(true);
    expect(phases.at(-1)?.kind).toBe('done');
  });

  it('未绑定本地状态时拒绝二维码上传', async () => {
    mocks.accountLoad.mockResolvedValue({ friendCode: '', hasCabinetBound: false });
    const local = createLocalMaimaiAccount('本地玩家', 0);
    await expect(uploadMaimaiFromQrLogin({
      credential: { kind: 'text', qrCode: 'SGWCMAIDTEST' },
      selectedAccountIds: [local.id],
      targets: resolveUploadTargets([local], {}),
      sessionsByAccountId: {},
      catalog,
      signal: { aborted: false },
      onPhase: vi.fn(),
    })).rejects.toThrow(QR_REQUIRES_BIND_MESSAGE);
    expect(mocks.loginByQrUntilToken).not.toHaveBeenCalled();
  });
});

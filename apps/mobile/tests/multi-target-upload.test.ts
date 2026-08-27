import type { CatalogSnapshot } from '@/domain/models';
import { createLocalMaimaiAccount, createMaimaiBoundAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { ProviderError } from '@/providers/errors';
import { ScoreHubError } from '@/services/score-hub-client';

const mocks = vi.hoisted(() => ({
  createFriendLoginJob: vi.fn(),
  createCabinetScoreJob: vi.fn(),
  createUpdateScoreJob: vi.fn(),
  fetchActiveCabinetScoreJob: vi.fn(),
  pollLoginUntilToken: vi.fn(),
  pollUpdateScoreUntilDone: vi.fn(),
  pollCabinetScoreJobUntilDone: vi.fn(),
  fetchLatestSync: vi.fn(),
  loginByQrUntilToken: vi.fn(),
  bindCabinetByQr: vi.fn(),
  fetchMe: vi.fn(),
  uploadDivingFish: vi.fn(),
  uploadLxns: vi.fn(),
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
    createCabinetScoreJob: mocks.createCabinetScoreJob,
    createUpdateScoreJob: mocks.createUpdateScoreJob,
    fetchActiveCabinetScoreJob: mocks.fetchActiveCabinetScoreJob,
    pollLoginUntilToken: mocks.pollLoginUntilToken,
    pollUpdateScoreUntilDone: mocks.pollUpdateScoreUntilDone,
    pollCabinetScoreJobUntilDone: mocks.pollCabinetScoreJobUntilDone,
    fetchLatestSync: mocks.fetchLatestSync,
    loginByQrUntilToken: mocks.loginByQrUntilToken,
    bindCabinetByQr: mocks.bindCabinetByQr,
    fetchMe: mocks.fetchMe,
  };
});
vi.mock('@/services/diving-fish-upload', () => ({
  uploadRecordsToDivingFish: mocks.uploadDivingFish,
}));
vi.mock('@/services/lxns-upload', () => ({
  uploadRecordsToLxns: mocks.uploadLxns,
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
    upsert: (...args: unknown[]) => mocks.accountPatch(...args),
    getByFriendCode: async (friendCode: string) => {
      const current = await mocks.accountLoad();
      if (current?.token && (!friendCode || current.friendCode === friendCode || !current.friendCode)) {
        return {
          friendCode: current.friendCode || friendCode,
          token: current.token,
          hasCabinetBound: current.hasCabinetBound === true,
          updatedAt: Date.now(),
        };
      }
      return null;
    },
    select: (...args: unknown[]) => mocks.accountLoad(...args),
    listWithToken: async () => [],
  },
}));

// Must be imported after the hoisted workflow mocks.
// eslint-disable-next-line import/first
import {
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
    mocks.fetchActiveCabinetScoreJob.mockResolvedValue(null);
    mocks.createCabinetScoreJob.mockResolvedValue({
      id: 'cabinet-score-job',
      status: 'queued',
      stage: 'queued',
      cleanupStatus: 'not_required',
      progress: null,
      syncId: null,
      scoreCount: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mocks.pollCabinetScoreJobUntilDone.mockResolvedValue({
      id: 'cabinet-score-job',
      status: 'completed',
      stage: 'persist',
      cleanupStatus: 'succeeded',
      progress: { detailsFetched: 1 },
      syncId: 'sync',
      scoreCount: 1,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
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
      resolveCatalog: async () => catalog,
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

  it('仅落雪目标直接写入 Score Hub 成绩且不请求曲库', async () => {
    const lxns = createMaimaiBoundAccount({
      providerId: 'lxns', displayName: '落雪玩家', rating: 0, playerId: 'lxns',
    });
    const water = createMaimaiBoundAccount({
      providerId: 'diving-fish', displayName: '未勾选水鱼', rating: 0, playerId: 'water',
    });
    const lxnsSession: ProviderSession = {
      mode: 'lxns-oauth', accessToken: 'access', refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000, persistable: true,
    };
    const waterSession: ProviderSession = {
      mode: 'import-token', value: 'import-token', persistable: true,
    };
    const resolveCatalog = vi.fn(async () => catalog);
    mocks.uploadLxns.mockResolvedValue({ uploaded: 1, session: lxnsSession });

    const result = await uploadMaimaiFromFriendCode({
      friendCode: '123456789012345',
      selectedAccountIds: [lxns.id],
      targets: resolveUploadTargets([lxns, water], {
        [lxns.id]: lxnsSession,
        [water.id]: waterSession,
      }),
      sessionsByAccountId: {
        [lxns.id]: lxnsSession,
        [water.id]: waterSession,
      },
      resolveCatalog,
      signal: { aborted: false },
      onPhase: vi.fn(),
      onNeedFriendAccept: vi.fn(),
    });

    expect(resolveCatalog).not.toHaveBeenCalled();
    expect(mocks.uploadLxns).toHaveBeenCalledWith(expect.objectContaining({
      records: [expect.objectContaining({ id: 1696, type: 'dx', level_index: 3 })],
    }));
    expect(mocks.uploadDivingFish).not.toHaveBeenCalled();
    expect(result.targetResults).toEqual([
      expect.objectContaining({ account: lxns, status: 'success', written: 1 }),
    ]);
  });

  it('本地与水鱼混合目标只解析一次轻量曲库', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    const water = createMaimaiBoundAccount({
      providerId: 'diving-fish', displayName: '水鱼玩家', rating: 0, playerId: 'water',
    });
    const session: ProviderSession = {
      mode: 'import-token', value: 'import-token', persistable: true,
    };
    const resolveCatalog = vi.fn(async () => catalog);
    mocks.uploadDivingFish.mockResolvedValue({ uploaded: 1 });

    await uploadMaimaiFromFriendCode({
      friendCode: '123456789012345',
      selectedAccountIds: [local.id, water.id],
      targets: resolveUploadTargets([local, water], { [water.id]: session }),
      sessionsByAccountId: { [water.id]: session },
      resolveCatalog,
      signal: { aborted: false },
      onPhase: vi.fn(),
      onNeedFriendAccept: vi.fn(),
    });

    expect(resolveCatalog).toHaveBeenCalledTimes(1);
    expect(mocks.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.uploadDivingFish).toHaveBeenCalledTimes(1);
  });

  it('严格先取得原始成绩再等待曲库，曲库到达后续接映射和写入', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    const order: string[] = [];
    let releaseCatalog!: (value: CatalogSnapshot) => void;
    const resolveCatalog = vi.fn(() => new Promise<CatalogSnapshot>((resolve) => {
      order.push('catalog');
      releaseCatalog = resolve;
    }));
    mocks.fetchLatestSync.mockImplementationOnce(async () => {
      order.push('scores');
      return {
        id: 'sync',
        scores: [{
          musicId: '11696', chartIndex: 3, type: 'dx', dxScore: 1900,
          score: '100.5%', fc: 'app', fs: 'fdxp',
        }],
      };
    });
    mocks.saveSnapshot.mockImplementationOnce(async () => {
      order.push('upload');
    });

    const upload = uploadMaimaiFromFriendCode({
      friendCode: '123456789012345',
      selectedAccountIds: [local.id],
      targets: resolveUploadTargets([local], {}),
      sessionsByAccountId: {},
      resolveCatalog,
      signal: { aborted: false },
      onPhase: vi.fn(),
      onNeedFriendAccept: vi.fn(),
    });

    await vi.waitFor(() => expect(resolveCatalog).toHaveBeenCalledTimes(1));
    expect(order).toEqual(['scores', 'catalog']);
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
    releaseCatalog(catalog);
    await upload;
    expect(order).toEqual(['scores', 'catalog', 'upload']);
    expect(mocks.fetchLatestSync).toHaveBeenCalledTimes(1);
  });

  it('没有成绩时不请求曲库', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    const resolveCatalog = vi.fn(async () => catalog);
    mocks.fetchLatestSync.mockResolvedValueOnce({ id: 'empty', scores: [] });

    await expect(uploadMaimaiFromFriendCode({
      friendCode: '123456789012345',
      selectedAccountIds: [local.id],
      targets: resolveUploadTargets([local], {}),
      sessionsByAccountId: {},
      resolveCatalog,
      signal: { aborted: false },
      onPhase: vi.fn(),
      onNeedFriendAccept: vi.fn(),
    })).rejects.toThrow('未获取到成绩数据');
    expect(resolveCatalog).not.toHaveBeenCalled();
  });

  it('好友码登录先进入发送申请阶段，再进入等待同意并弹通知', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    mocks.createFriendLoginJob.mockResolvedValue({
      jobId: 'login-job',
      botFriendCode: '999999999999999',
      body: {},
    });
    const onNeedFriendAccept = vi.fn();
    mocks.pollLoginUntilToken.mockImplementation(async (input: {
      onSendingFriend?: (info: { botFriendCode: string | null; stage: string | null }) => void;
      onWaitingFriend?: (info: { botFriendCode: string | null; stage: string | null }) => void;
    }) => {
      input.onSendingFriend?.({ botFriendCode: '999999999999999', stage: 'send_request' });
      input.onWaitingFriend?.({ botFriendCode: '999999999999999', stage: 'wait_acceptance' });
      return 'hub-token';
    });
    const phases: string[] = [];
    await uploadMaimaiFromFriendCode({
      friendCode: '123456789012345',
      selectedAccountIds: [local.id],
      targets: resolveUploadTargets([local], {}),
      sessionsByAccountId: {},
      resolveCatalog: async () => catalog,
      signal: { aborted: false },
      onPhase: (phase) => phases.push(phase.kind),
      onNeedFriendAccept,
    });

    const sendAt = phases.indexOf('sending_friend');
    const waitAt = phases.indexOf('awaiting_friend');
    expect(sendAt).toBeGreaterThanOrEqual(0);
    expect(waitAt).toBeGreaterThan(sendAt);
    expect(onNeedFriendAccept).toHaveBeenCalledTimes(1);
    expect(phases.at(0)).toBe('logging_in');
  });

  it('好友码路径只传成绩，不同时绑定二维码', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    const phases: string[] = [];
    const result = await uploadMaimaiFromFriendCode({
      friendCode: '123456789012345',
      selectedAccountIds: [local.id],
      targets: resolveUploadTargets([local], {}),
      sessionsByAccountId: {},
      resolveCatalog: async () => catalog,
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
    })).rejects.toThrow(/请先完成一次好友码上传/);
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
      resolveCatalog: async () => catalog,
      signal: { aborted: false },
      onPhase: (phase) => phases.push(phase.kind),
    });

    expect(mocks.createFriendLoginJob).not.toHaveBeenCalled();
    expect(mocks.createUpdateScoreJob).toHaveBeenCalledWith('session-token', null, expect.anything());
    expect(result.uploaded).toBe(1);
    expect(phases).not.toContain('awaiting_friend');
    expect(phases.at(-1)).toBe('done');
  });

  it('二维码登录后创建独立成绩任务并复用同一写出链路', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    mocks.accountLoad.mockResolvedValue({ friendCode: '', hasCabinetBound: false });
    mocks.loginByQrUntilToken.mockResolvedValue({
      token: 'qr-token',
      friendCode: '987654321098765',
    });
    mocks.fetchMe.mockResolvedValue({
      friendCode: '987654321098765',
      hasCabinetUserId: true,
    });
    const onQrAccepted = vi.fn();
    const phases: { kind: string; authMode?: string }[] = [];
    const result = await uploadMaimaiFromQrLogin({
      credential: { kind: 'text', qrCode: 'SGWCMAIDTEST' },
      selectedAccountIds: [local.id],
      targets: resolveUploadTargets([local], {}),
      sessionsByAccountId: {},
      resolveCatalog: async () => catalog,
      signal: { aborted: false },
      onPhase: (phase) => {
        phases.push({
          kind: phase.kind,
          authMode: phase.kind === 'logging_in' ? phase.authMode : undefined,
        });
      },
      onQrAccepted,
    });

    expect(mocks.loginByQrUntilToken).toHaveBeenCalledTimes(1);
    expect(mocks.fetchActiveCabinetScoreJob).toHaveBeenCalledWith('qr-token', expect.anything());
    expect(mocks.createCabinetScoreJob).toHaveBeenCalledWith(
      'qr-token',
      { kind: 'text', qrCode: 'SGWCMAIDTEST' },
      expect.anything(),
    );
    expect(mocks.pollCabinetScoreJobUntilDone).toHaveBeenCalledWith(expect.objectContaining({
      token: 'qr-token',
      job: expect.objectContaining({ id: 'cabinet-score-job' }),
    }));
    expect(mocks.createUpdateScoreJob).not.toHaveBeenCalled();
    expect(onQrAccepted).toHaveBeenCalledTimes(1);
    expect(mocks.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.saveSnapshot.mock.calls[0]?.[1]?.player?.id).toBe('987654321098765');
    expect(result.uploaded).toBe(1);
    expect(phases.some((phase) => phase.kind === 'logging_in' && phase.authMode === 'qr')).toBe(true);
    expect(phases.at(-1)?.kind).toBe('done');
  });

  it('二维码登录未建立玩家绑定时给出稳定错误且不创建成绩任务', async () => {
    mocks.accountLoad.mockResolvedValue({ friendCode: '', hasCabinetBound: false });
    mocks.loginByQrUntilToken.mockResolvedValue({
      token: 'qr-token',
      friendCode: '987654321098765',
    });
    mocks.fetchMe.mockResolvedValue({
      friendCode: '987654321098765',
      hasCabinetUserId: false,
    });
    const local = createLocalMaimaiAccount('本地玩家', 0);
    await expect(uploadMaimaiFromQrLogin({
      credential: { kind: 'text', qrCode: 'SGWCMAIDTEST' },
      selectedAccountIds: [local.id],
      targets: resolveUploadTargets([local], {}),
      sessionsByAccountId: {},
      resolveCatalog: async () => catalog,
      signal: { aborted: false },
      onPhase: vi.fn(),
    })).rejects.toMatchObject({ code: 'CABINET_NOT_BOUND' });
    expect(mocks.loginByQrUntilToken).toHaveBeenCalledTimes(1);
    expect(mocks.createCabinetScoreJob).not.toHaveBeenCalled();
  });

  it('二维码同步发现活动任务时直接恢复且不重复提交二维码', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    const active = {
      id: 'active-cabinet-job',
      status: 'processing',
      stage: 'get_music',
      cleanupStatus: 'not_required',
      progress: { detailsFetched: 50 },
      syncId: null,
      scoreCount: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mocks.loginByQrUntilToken.mockResolvedValue({
      token: 'qr-token',
      friendCode: '987654321098765',
    });
    mocks.fetchActiveCabinetScoreJob.mockResolvedValue(active);

    await uploadMaimaiFromQrLogin({
      credential: { kind: 'text', qrCode: 'SGWCMAIDNEW' },
      selectedAccountIds: [local.id],
      targets: resolveUploadTargets([local], {}),
      sessionsByAccountId: {},
      resolveCatalog: async () => catalog,
      signal: { aborted: false },
      onPhase: vi.fn(),
    });

    expect(mocks.createCabinetScoreJob).not.toHaveBeenCalled();
    expect(mocks.pollCabinetScoreJobUntilDone).toHaveBeenCalledWith(expect.objectContaining({
      job: active,
    }));
  });

  it('二维码任务创建发生并发冲突时恢复刚出现的活动任务', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    const active = {
      id: 'raced-cabinet-job',
      status: 'processing',
      stage: 'get_music',
      cleanupStatus: 'not_required',
      progress: null,
      syncId: null,
      scoreCount: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mocks.loginByQrUntilToken.mockResolvedValue({
      token: 'qr-token',
      friendCode: '987654321098765',
    });
    mocks.fetchActiveCabinetScoreJob
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(active);
    mocks.createCabinetScoreJob.mockRejectedValueOnce(new ScoreHubError(
      'sync in progress',
      409,
      false,
      { code: 'SYNC_IN_PROGRESS' },
    ));

    await uploadMaimaiFromQrLogin({
      credential: { kind: 'text', qrCode: 'SGWCMAIDRACE' },
      selectedAccountIds: [local.id],
      targets: resolveUploadTargets([local], {}),
      sessionsByAccountId: {},
      resolveCatalog: async () => catalog,
      signal: { aborted: false },
      onPhase: vi.fn(),
    });

    expect(mocks.fetchActiveCabinetScoreJob).toHaveBeenCalledTimes(2);
    expect(mocks.pollCabinetScoreJobUntilDone).toHaveBeenCalledWith(expect.objectContaining({
      job: active,
    }));
  });
});

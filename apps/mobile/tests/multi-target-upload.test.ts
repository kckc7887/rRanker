import type { Credential } from '@rranker/sdk/credentials';
import type { CatalogSnapshot } from '@rranker/game-maimai/domain/models';
import { resolveMaimaiCourseRank } from '@rranker/game-maimai/domain/maimai-course-rank';
import { createLocalMaimaiAccount as localAccount, createMaimaiBoundAccount as remoteAccount } from '@rranker/game-maimai/accounts';
import { useAccountStore } from '@rranker/sdk/state/account-store';

import { ProviderError } from '@rranker/sdk/providers/errors';
import { SessionPersistenceError } from '@rranker/sdk/domain/session-vault';
import { ScoreHubError } from '@rranker/tool-maimai/services/score-hub-client';
import { invalidateResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';

const mocks = vi.hoisted(() => ({
  readSave: vi.fn(),
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

vi.mock('@rranker/tool-maimai/services/score-hub-client', async () => {
  const actual = await vi.importActual<typeof import('@rranker/tool-maimai/services/score-hub-client')>(
    '@rranker/tool-maimai/services/score-hub-client',
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
vi.mock('@rranker/tool-maimai/services/maimai-save', () => ({ readMaimaiSave: mocks.readSave }));
vi.mock('@rranker/tool-maimai/services/diving-fish-upload', () => ({
  uploadRecordsToDivingFish: mocks.uploadDivingFish,
}));
vi.mock('@rranker/tool-maimai/services/lxns-upload', () => ({
  uploadRecordsToLxns: mocks.uploadLxns,
}));
vi.mock('@rranker/game-maimai/storage/score-repository', () => ({
  ScoreRepository: class {
    save = mocks.saveSnapshot;
  },
}));
vi.mock('@rranker/tool-maimai/storage/score-hub-account-store', () => ({
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

// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import {
  uploadMaimaiWithScoreHubQr,
  resolveUploadTargets,
  uploadMaimaiFromFriendCode,
  uploadMaimaiFromQrLogin,
  uploadMaimaiPreferringSession,
  uploadMaimaiWithScoreHubSession,
} from '@rranker/tool-maimai/services/upload-maimai-from-friend-code';

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
  it('未确认目标不计入成功写入数，下一目标启动前等待恢复', async () => {
    const water = createMaimaiBoundAccount({ providerId: 'diving-fish', playerId: 'water', displayName: '水鱼', rating: 0 });
    const local = createLocalMaimaiAccount('本地玩家', 0);
    let resume!: () => void;
    let paused = false;
    const waitUntilResumed = vi.fn(async () => { if (paused) await new Promise<void>(resolve => { resume = resolve; }); });
    mocks.uploadDivingFish.mockImplementationOnce(async () => { paused = true; return { status: 'unconfirmed', uploaded: 0 }; });
    const phases: string[] = [];
    const promise = uploadMaimaiFromFriendCode({ friendCode: '123456789012345', selectedAccountIds: [water.id, local.id],
      targets: resolveUploadTargets([water, local], { [water.id]: { mode: 'import-token', value: 'token', persistable: true } }),
      sessionsByAccountId: { [water.id]: { mode: 'import-token', value: 'token', persistable: true } }, resolveCatalog: async () => catalog,
      signal: { aborted: false, waitUntilResumed }, onPhase: phase => { if ('message' in phase) phases.push(phase.message); }, onNeedFriendAccept: vi.fn() });
    await vi.waitFor(() => expect(mocks.uploadDivingFish).toHaveBeenCalledTimes(1));
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(resume).toBeTypeOf('function'));
    paused = false; resume();
    const result = await promise;
    expect(result.uploaded).toBe(1);
    expect(result.targetResults.map(row => row.status)).toEqual(['unconfirmed', 'success']);
    expect(phases.at(-1)).toContain('未确认');
  });
  beforeEach(() => {
    vi.clearAllMocks();
    useAccountStore.setState({ boundAccounts: [], credentialsById: {}, selectedAccountId: 'unbound' });
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
    mocks.readSave.mockResolvedValue({
      scores: [{ musicId: '1696', chartIndex: 3, type: 'dx', dxScore: 1900, score: 100.5, fc: 'app', fs: 'fdxp' }],
      courseRank: 23,
    });
    mocks.saveSnapshot.mockResolvedValue(undefined);
    mocks.accountLoad.mockResolvedValue({ friendCode: '', hasCabinetBound: true });
    mocks.accountPatch.mockResolvedValue({ friendCode: '', hasCabinetBound: true });
    mocks.bindCabinetByQr.mockResolvedValue({ ok: true, alreadyBound: false });
    mocks.fetchMe.mockResolvedValue({ friendCode: '123456789012345', hasCabinetUserId: true });
  });

  it('好友码上传在登录挂起期间删除目标后不再落盘', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    let releaseLogin: (value: { jobId: string; botFriendCode: null; body: { __skipAuthToken: string } }) => void = () => undefined;
    mocks.createFriendLoginJob.mockReturnValue(new Promise((resolve) => { releaseLogin = resolve; }));
    const pending = uploadMaimaiFromFriendCode({
      friendCode: '123456789012345',
      selectedAccountIds: [local.id],
      targets: resolveUploadTargets([local], {}),
      sessionsByAccountId: {},
      resolveCatalog: async () => catalog,
      signal: { aborted: false },
      onPhase: vi.fn(),
      onNeedFriendAccept: vi.fn(),
    });
    invalidateResourceWrites(`account:${local.id}`);
    releaseLogin({ jobId: 'login-job', botFriendCode: null, body: { __skipAuthToken: 'hub-token' } });
    const result = await pending;
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
    expect(result.targetResults).toEqual([
      expect.objectContaining({ status: 'failed', written: 0 }),
    ]);
    expect(result.refreshedAccounts).toEqual([]);
  });

  it('二维码上传在读取挂起期间删除目标后不再落盘', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    let releaseLogin: (value: { scores: unknown[]; courseRank: number }) => void = () => undefined;
    mocks.readSave.mockReturnValue(new Promise((resolve) => { releaseLogin = resolve; }));
    const pending = uploadMaimaiFromQrLogin({
      credential: { kind: 'text', qrCode: 'SGWCMAIDTEST' },
      selectedAccountIds: [local.id],
      targets: resolveUploadTargets([local], {}),
      sessionsByAccountId: {},
      resolveCatalog: async () => catalog,
      signal: { aborted: false },
      onPhase: vi.fn(),
    });
    invalidateResourceWrites(`account:${local.id}`);
    releaseLogin({ scores: [{ musicId: '1696', type: 'dx', chartIndex: 3, score: 100.5 }], courseRank: 23 });
    const result = await pending;
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
    expect(result.refreshedAccounts).toEqual([]);
    expect(result.targetResults[0]?.status).toBe('failed');
  });

  it('失效的落雪目标不再写远端，其他目标独立完成', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    const lxns = createMaimaiBoundAccount({
      providerId: 'lxns', displayName: '落雪玩家', rating: 0, playerId: 'lxns',
    });
    const lxnsSession: Credential = {
      mode: 'lxns-oauth', accessToken: 'access', refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000, persistable: true,
    };
    mocks.uploadLxns.mockResolvedValue({ status: 'success', uploaded: 1, session: lxnsSession });
    let releaseLogin: (value: { jobId: string; botFriendCode: null; body: { __skipAuthToken: string } }) => void = () => undefined;
    mocks.createFriendLoginJob.mockReturnValue(new Promise((resolve) => { releaseLogin = resolve; }));
    const pending = uploadMaimaiFromFriendCode({
      friendCode: '123456789012345',
      selectedAccountIds: [local.id, lxns.id],
      targets: resolveUploadTargets([local, lxns], { [lxns.id]: lxnsSession }),
      sessionsByAccountId: { [lxns.id]: lxnsSession },
      resolveCatalog: async () => catalog,
      signal: { aborted: false },
      onPhase: vi.fn(),
      onNeedFriendAccept: vi.fn(),
    });
    invalidateResourceWrites(`account:${lxns.id}`);
    releaseLogin({ jobId: 'login-job', botFriendCode: null, body: { __skipAuthToken: 'hub-token' } });
    const result = await pending;

    expect(mocks.uploadLxns).not.toHaveBeenCalled();
    expect(result.targetResults).toEqual([
      expect.objectContaining({ account: local, status: 'success', written: 1 }),
      expect.objectContaining({ account: lxns, status: 'failed', written: 0 }),
    ]);
  });

  it('单个目标失败不回滚已经成功的本地写入', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    const water = createMaimaiBoundAccount({
      providerId: 'diving-fish', displayName: '水鱼玩家', rating: 0, playerId: 'water',
    });
    const session: Credential = {
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
      expect.objectContaining({ account: water, status: 'failed', errorMessage: '写入失败，请稍后重试。' }),
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
    const lxnsSession: Credential = {
      mode: 'lxns-oauth', accessToken: 'access', refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000, persistable: true,
    };
    const waterSession: Credential = {
      mode: 'import-token', value: 'import-token', persistable: true,
    };
    const resolveCatalog = vi.fn(async () => catalog);
    mocks.uploadLxns.mockResolvedValue({ status: 'success', uploaded: 1, session: lxnsSession });

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
    const session: Credential = {
      mode: 'import-token', value: 'import-token', persistable: true,
    };
    const resolveCatalog = vi.fn(async () => catalog);
    mocks.uploadDivingFish.mockResolvedValue({ status: 'success', uploaded: 1 });

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

  it.each(['credential_storage', 'local_commit'] as const)('会话验证后的 %s 故障不被网络兜底吞掉或转好友码登录', async code => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    mocks.accountLoad.mockResolvedValue({ friendCode: '123456789012345', hasCabinetBound: true, token: 'session-token' });
    const failure = new SessionPersistenceError(code);
    mocks.accountPatch.mockRejectedValueOnce(failure);
    await expect(uploadMaimaiPreferringSession({
      friendCode: '123456789012345',
      preferSession: true,
      selectedAccountIds: [local.id],
      targets: resolveUploadTargets([local], {}),
      sessionsByAccountId: {},
      resolveCatalog: async () => catalog,
      signal: { aborted: false },
      onPhase: vi.fn(),
      onNeedFriendAccept: vi.fn(),
    })).rejects.toBe(failure);
    expect(mocks.createFriendLoginJob).not.toHaveBeenCalled();
    expect(mocks.createUpdateScoreJob).not.toHaveBeenCalled();
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
  });

  it('首次二维码绑定保存真实好友码，成绩失败后保留会话供下次复用', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    const friendCode = '987654321098765';
    mocks.accountLoad.mockResolvedValue({ friendCode: '', hasCabinetBound: false });
    mocks.loginByQrUntilToken.mockResolvedValue({ token: 'qr-token', friendCode: null });
    mocks.fetchMe.mockResolvedValue({ friendCode, hasCabinetUserId: true });
    mocks.accountPatch.mockImplementation(async value => { mocks.accountLoad.mockResolvedValue(value); return value; });
    mocks.createUpdateScoreJob.mockRejectedValueOnce(new ScoreHubError('temporary', 503));
    const input = {
      selectedAccountIds: [local.id], targets: resolveUploadTargets([local], {}), sessionsByAccountId: {},
      resolveCatalog: async () => catalog, signal: { aborted: false }, onPhase: vi.fn(),
    };
    const bound = vi.fn();
    await expect(uploadMaimaiWithScoreHubQr({ ...input, credential: { kind: 'text', qrCode: 'SGWCMAIDTEST' },
      onAccountBound: bound })).rejects.toThrow();
    expect(bound).toHaveBeenCalledWith(friendCode);
    expect(await mocks.accountLoad()).toMatchObject({ friendCode, token: 'qr-token', hasCabinetBound: true });
    const result = await uploadMaimaiWithScoreHubSession({ ...input, expectedFriendCode: friendCode });
    expect(result.uploaded).toBe(1);
    expect(mocks.saveSnapshot.mock.calls[0]?.[1]?.player?.id).toBe(friendCode);
    expect(mocks.createUpdateScoreJob).toHaveBeenLastCalledWith('qr-token', null, expect.anything());
    expect(mocks.loginByQrUntilToken).toHaveBeenCalledTimes(1);
    expect(mocks.createCabinetScoreJob).not.toHaveBeenCalled();
    expect(mocks.readSave).not.toHaveBeenCalled();
  });

  it('二维码未建立身份时不保存或读取成绩', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    mocks.loginByQrUntilToken.mockResolvedValue({ token: 'qr-token', friendCode: null });
    mocks.fetchMe.mockResolvedValue({ friendCode: null, hasCabinetUserId: false });
    await expect(uploadMaimaiWithScoreHubQr({ credential: { kind: 'text', qrCode: 'SGWCMAIDTEST' },
      selectedAccountIds: [local.id], targets: resolveUploadTargets([local], {}), sessionsByAccountId: {},
      resolveCatalog: async () => catalog, signal: { aborted: false }, onPhase: vi.fn(), onAccountBound: vi.fn(),
    })).rejects.toMatchObject({ code: 'CABINET_NOT_BOUND' });
    expect(mocks.accountPatch).not.toHaveBeenCalled();
    expect(mocks.createUpdateScoreJob).not.toHaveBeenCalled();
  });

  it('独立二维码只取档一次并复用多目标写入，部分失败仍保存其他目标', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    const water = createMaimaiBoundAccount({ providerId: 'diving-fish', playerId: 'water', displayName: '水鱼', rating: 0 });
    const sessions = { [water.id]: { mode: 'import-token' as const, value: 'token', persistable: true as const } };
    mocks.uploadDivingFish.mockRejectedValueOnce(new Error('private detail'));
    const result = await uploadMaimaiFromQrLogin({ credential: { kind: 'text', qrCode: 'SGWCMAIDTEST' },
      selectedAccountIds: [water.id, local.id], targets: resolveUploadTargets([water, local], sessions), sessionsByAccountId: sessions,
      resolveCatalog: async () => catalog, signal: { aborted: false }, onPhase: vi.fn(),
    });
    expect(mocks.readSave).toHaveBeenCalledExactlyOnceWith('SGWCMAIDTEST');
    expect(mocks.loginByQrUntilToken).not.toHaveBeenCalled();
    expect(mocks.createCabinetScoreJob).not.toHaveBeenCalled();
    expect(result.targetResults.map(item => item.status)).toEqual(['failed', 'success']);
    expect(result.targetResults[0]?.errorMessage).toBe('写入失败，请稍后重试。');
    expect(result.uploaded).toBe(1);
  });

  it.each([0, 23, undefined])('独立二维码同步将段位 %s 保存到本地成绩与最佳成绩', async courseRank => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    mocks.readSave.mockResolvedValueOnce({
      scores: [{ musicId: '1696', chartIndex: 3, type: 'dx', score: 100.5 }], courseRank,
    });
    const result = await uploadMaimaiFromQrLogin({ credential: { kind: 'text', qrCode: 'SGWCMAIDTEST' },
      selectedAccountIds: [local.id], targets: resolveUploadTargets([local], {}), sessionsByAccountId: {},
      resolveCatalog: async () => catalog, signal: { aborted: false }, onPhase: vi.fn(),
    });
    expect(result.targetResults[0]?.status).toBe('success');
    const snapshot = mocks.saveSnapshot.mock.calls[0]?.[1];
    expect(snapshot.player.extension.courseRank).toBe(courseRank);
    expect(snapshot.best50.player.extension.courseRank).toBe(courseRank);
    expect(resolveMaimaiCourseRank(snapshot.player)?.label).toBe(
      courseRank === 0 ? '初学者' : courseRank === 23 ? '里皆传' : undefined,
    );
    expect(result.refreshedAccounts[0]?.snapshot).toEqual(snapshot);
  });

  it('独立二维码同步将段位传给落雪，落雪失败时仍保存本地段位', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    const lxns = createMaimaiBoundAccount({ providerId: 'lxns', playerId: 'lxns', displayName: '落雪', rating: 0 });
    const sessions: Record<string, Credential> = { [lxns.id]: {
      mode: 'lxns-oauth', accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 120_000, persistable: true,
    } };
    mocks.uploadLxns.mockRejectedValueOnce(new ProviderError('permission', 'private detail', false));
    const result = await uploadMaimaiFromQrLogin({ credential: { kind: 'text', qrCode: 'SGWCMAIDTEST' },
      selectedAccountIds: [lxns.id, local.id], targets: resolveUploadTargets([lxns, local], sessions), sessionsByAccountId: sessions,
      resolveCatalog: async () => catalog, signal: { aborted: false }, onPhase: vi.fn(),
    });
    expect(mocks.uploadLxns).toHaveBeenCalledWith(expect.objectContaining({ courseRank: 23 }));
    expect(result.targetResults.map(item => item.status)).toEqual(['failed', 'success']);
    expect(result.targetResults[0]?.errorMessage).toBe('写入失败，请稍后重试。');
    expect(result.refreshedAccounts[0]?.snapshot.player.extension).toEqual({ kind: 'maimai', courseRank: 23 });
  });

  it('独立二维码取消后等待取档返回，迟到成绩不落盘', async () => {
    const local = createLocalMaimaiAccount('本地玩家', 0);
    let finish!: (value: { scores: unknown[]; courseRank: number }) => void;
    mocks.readSave.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const signal = { aborted: false };
    const pending = uploadMaimaiFromQrLogin({ credential: { kind: 'text', qrCode: 'SGWCMAIDTEST' },
      selectedAccountIds: [local.id], targets: resolveUploadTargets([local], {}), sessionsByAccountId: {},
      resolveCatalog: async () => catalog, signal, onPhase: vi.fn(),
    });
    await vi.waitFor(() => expect(finish).toBeDefined());
    signal.aborted = true;
    finish({ scores: [{ musicId: '1696', type: 'dx', chartIndex: 3, score: 100.5 }], courseRank: 23 });
    await expect(pending).rejects.toThrow('已取消');
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
  });
});

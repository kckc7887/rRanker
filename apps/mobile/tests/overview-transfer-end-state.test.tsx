import { act, cleanup, renderHook } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { UploadTaskController, uploadTaskController } from '@/services/upload-task-controller';
import { useOverviewUpload } from '@/hooks/use-overview-upload';
import { createMaimaiBoundAccount, type BoundAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { type UploadResult, type UploadTargetResult } from '@/services/upload-maimai-from-friend-code';
import type { transferMaimaiFromLxns } from '@/services/transfer-maimai-from-lxns';
import { fixtureCatalog } from '@/fixtures/sanitized';
jest.mock('@/services/upload-task-controller', () => {
  const actual = jest.requireActual<typeof import('@/services/upload-task-controller')>('@/services/upload-task-controller');
  return { ...actual, uploadTaskController: new actual.UploadTaskController() };
});

const mockNotification = jest.fn();
const mockTransfer = jest.fn<typeof transferMaimaiFromLxns>();
const mockInvalidate = jest.fn(async () => undefined);
const mockUpdateBoundAccountScore = jest.fn();

jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: mockNotification }),
}));
jest.mock('@/services/transfer-maimai-from-lxns', () => ({
  transferMaimaiFromLxns: (...args: Parameters<typeof transferMaimaiFromLxns>) => mockTransfer(...args),
}));
jest.mock('@/services/invalidate-account-data', () => ({
  invalidateAccountDataQueries: () => mockInvalidate(),
}));
jest.mock('@/state/session-store', () => ({
  applyLxnsTokenRotation: jest.fn(),
  useSession: (selector: (state: unknown) => unknown) => selector({
    updateBoundAccountScore: mockUpdateBoundAccountScore,
  }),
}));

const source = createMaimaiBoundAccount({
  providerId: 'lxns', displayName: '来源落雪', rating: 15000, playerId: 'source',
});
const water = createMaimaiBoundAccount({
  providerId: 'diving-fish', displayName: '水鱼玩家', rating: 15000, playerId: 'water',
});
const waterSecond = createMaimaiBoundAccount({
  providerId: 'diving-fish', displayName: '水鱼二号', rating: 15000, playerId: 'water-2',
});

const lxnsSession: ProviderSession = {
  mode: 'lxns-oauth', accessToken: 'access', refreshToken: 'refresh',
  expiresAt: Date.now() + 60_000, persistable: true,
};
const importSession: ProviderSession = {
  mode: 'import-token', value: 'import-token', persistable: true,
};
const sessionsByAccountId: Record<string, ProviderSession> = {
  [source.id]: lxnsSession,
  [water.id]: importSession,
  [waterSecond.id]: importSession,
};

function transferResult(input: {
  targetResults: UploadTargetResult[];
  uploaded?: number;
  skipped?: number;
  failedAccountNames?: string[];
  refreshedAccounts?: UploadResult['refreshedAccounts'];
}): UploadResult {
  return {
    uploaded: input.uploaded ?? 0,
    skipped: input.skipped ?? 0,
    failedAccountNames: input.failedAccountNames ?? [],
    refreshedAccounts: input.refreshedAccounts ?? [],
    targetResults: input.targetResults,
  };
}

function targetResult(account: BoundAccount, status: 'success' | 'failed'): UploadTargetResult {
  return status === 'success'
    ? { account, status, written: 120, skipped: 3 }
    : { account, status, written: 0, skipped: 0, errorMessage: '水鱼暂时不可用' };
}

type Params = Parameters<typeof useOverviewUpload>[0];

function options(overrides: Partial<Params> = {}): Params {
  return {
    boundAccounts: [source, water, waterSecond],
    activeAccountId: source.id,
    activeGameId: 'maimai',
    sessionsByAccountId,
    catalogQuery: {
      data: fixtureCatalog, error: null, refetch: jest.fn(),
    } as unknown as Params['catalogQuery'],
    ratingDigits: 5,
    syncBusy: false,
    operation: { begin: jest.fn(() => true), finish: jest.fn() },
    ...overrides,
  };
}

/** 选中来源账号与两个水鱼目标，然后执行一次传输。 */
async function transferScore(): Promise<{ ok: boolean | undefined; phase: unknown }> {
  const hook = await renderHook(() => useOverviewUpload(options()));
  await act(async () => { hook.result.current.setMaimaiSourceAccountId(source.id); });
  await act(async () => {
    hook.result.current.setMaimaiTransferTargetIds([water.id, waterSecond.id]);
  });
  // 来源账号本身不计入可写目标（服务会拒绝把自己作为目标），两个水鱼账号可以写入。
  expect(hook.result.current.maimaiTransferTargets
    .filter((target) => target.writable && target.account.id !== source.id)).toHaveLength(2);
  let ok: boolean | undefined;
  await act(async () => { ok = await hook.result.current.syncMaimaiFromLxns(); });
  const phase = hook.result.current.uploadPhase;
  await hook.unmount();
  return { ok, phase };
}

beforeEach(() => {
  jest.requireMock<{ uploadTaskController: UploadTaskController }>('@/services/upload-task-controller').uploadTaskController = new UploadTaskController();
  jest.clearAllMocks();
  mockInvalidate.mockResolvedValue(undefined);
});
afterEach(async () => { await cleanup(); uploadTaskController.begin(); uploadTaskController.cancel(); });

describe('总览从落雪传输成绩的页面终态', () => {
  it('暂停时不开始曲库和传输，恢复后继续同一任务', async () => {
    const refetch = jest.fn(async () => ({ data: fixtureCatalog }));
    const config = options({ catalogQuery: { data: undefined, error: null, refetch } as unknown as Params['catalogQuery'] });
    const hook = await renderHook(() => useOverviewUpload(config));
    await act(async () => {
      hook.result.current.setMaimaiSourceAccountId(source.id);
      hook.result.current.setMaimaiTransferTargetIds([water.id]);
    });
    let pauseFirst = true;
    const unsubscribe = uploadTaskController.subscribe(snapshot => {
      if (pauseFirst && snapshot.status === 'running') { pauseFirst = false; uploadTaskController.pause(); }
    });
    mockTransfer.mockResolvedValue(transferResult({ targetResults: [targetResult(water, 'success')] }));
    let pending!: Promise<boolean>;
    try {
      await act(async () => { pending = hook.result.current.syncMaimaiFromLxns(); });
      expect(uploadTaskController.getSnapshot().status).toBe('paused');
      expect(refetch).not.toHaveBeenCalled();
      expect(mockTransfer).not.toHaveBeenCalled();
      await act(async () => { uploadTaskController.resume(); await pending; });
      expect(refetch).toHaveBeenCalledTimes(1);
      expect(mockTransfer).toHaveBeenCalledTimes(1);
      expect(uploadTaskController.getSnapshot().status).toBe('done');
    } finally { unsubscribe(); await hook.unmount(); }
  });

  it('卸载后已发送的传输正常结算但不触发页面通知', async () => {
    let finish!: (result: UploadResult) => void;
    mockTransfer.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const config = options();
    const hook = await renderHook(() => useOverviewUpload(config));
    await act(async () => {
      hook.result.current.setMaimaiSourceAccountId(source.id);
      hook.result.current.setMaimaiTransferTargetIds([water.id]);
    });
    let pending!: Promise<boolean>;
    await act(async () => { pending = hook.result.current.syncMaimaiFromLxns(); });
    expect(mockTransfer).toHaveBeenCalledTimes(1);
    await hook.unmount();
    const result = transferResult({ uploaded: 120, targetResults: [targetResult(water, 'success')] });
    await act(async () => { finish(result); await pending; });
    expect(uploadTaskController.getSnapshot()).toMatchObject({ status: 'done', result });
    expect(mockNotification).not.toHaveBeenCalled();
    expect(config.operation.finish).toHaveBeenCalledTimes(1);
  });
  it('同时保留未确认目标和失败目标，不把未确认计为成功', async () => {
    mockTransfer.mockResolvedValue(transferResult({ targetResults: [
      { account: water, status: 'unconfirmed', written: 0, skipped: 0 },
      targetResult(waterSecond, 'failed'),
    ] }));
    const { ok } = await transferScore();
    expect(ok).toBe(false);
    expect(mockNotification).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'warning', message: expect.stringMatching(/水鱼玩家.*未确认.*水鱼二号.*失败/),
    }));
  });

  it('接入公共上传取消信号，取消后的迟到结果不通知、不刷新', async () => {
    mockTransfer.mockImplementation(async input => {
      expect(input.signal).toBe(uploadTaskController.getSignal());
      expect(input.signal?.waitUntilResumed).toBeInstanceOf(Function);
      uploadTaskController.cancel();
      return transferResult({ uploaded: 120, targetResults: [targetResult(water, 'success')] });
    });
    const { ok } = await transferScore();
    expect(ok).toBe(false);
    expect(mockNotification).not.toHaveBeenCalled();
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it('部分目标失败时给出警告通知与「部分完成」状态，且不报告传输成功', async () => {
    mockTransfer.mockResolvedValue(transferResult({
      uploaded: 120,
      skipped: 3,
      targetResults: [targetResult(water, 'success'), targetResult(waterSecond, 'failed')],
    }));

    const { ok, phase } = await transferScore();

    expect(ok).toBe(false);
    expect(mockNotification).toHaveBeenCalledTimes(1);
    expect(mockNotification).toHaveBeenCalledWith({
      title: '部分传输完成',
      message: '水鱼二号：写入失败，请重试。',
      variant: 'warning',
    });
    expect(phase).toEqual({ kind: 'error', message: '部分完成，1 个目标失败' });
  });

  it('全部目标失败时给出错误通知，并明确「所有目标均写入失败」', async () => {
    mockTransfer.mockResolvedValue(transferResult({
      targetResults: [targetResult(water, 'failed'), targetResult(waterSecond, 'failed')],
    }));

    const { ok, phase } = await transferScore();

    expect(ok).toBe(false);
    expect(mockNotification).toHaveBeenCalledWith({
      title: '传输失败',
      message: '水鱼玩家：写入失败，请重试。；水鱼二号：写入失败，请重试。',
      variant: 'error',
    });
    expect(phase).toEqual({ kind: 'error', message: '所有目标均写入失败' });
  });

  it('全部目标成功时报告写入条数并进入完成态', async () => {
    mockTransfer.mockResolvedValue(transferResult({
      uploaded: 240,
      skipped: 6,
      targetResults: [targetResult(water, 'success'), targetResult(waterSecond, 'success')],
    }));

    const { ok, phase } = await transferScore();

    expect(ok).toBe(true);
    expect(mockNotification).toHaveBeenCalledWith({
      title: '传输完成',
      message: '已从 来源落雪 向 2 个账号写入 240 条成绩',
      variant: 'success',
    });
    expect(phase).toEqual({ kind: 'done', message: '传输完成：写入 240 条', uploaded: 240, skipped: 6 });
  });

  it('单个目标写入成功但页面未能更新时，成功通知降级为警告并点名账号', async () => {
    mockTransfer.mockResolvedValue(transferResult({
      uploaded: 120,
      failedAccountNames: ['水鱼二号'],
      targetResults: [targetResult(water, 'success'), targetResult(waterSecond, 'success')],
    }));

    const { ok, phase } = await transferScore();

    expect(ok).toBe(true);
    expect(mockNotification).toHaveBeenCalledWith({
      title: '传输完成',
      message: '已从 来源落雪 向 2 个账号写入 120 条成绩；水鱼二号的页面未能更新',
      variant: 'warning',
    });
    expect(phase).toEqual({ kind: 'done', message: '传输完成：写入 120 条', uploaded: 120, skipped: 0 });
  });
});

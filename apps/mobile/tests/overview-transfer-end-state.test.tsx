/**
 * 跨层回归：总览「从落雪传输成绩」的多目标终态。
 *
 * 接缝：`transferMaimaiFromLxns` 的 `targetResults` → `useOverviewUpload.syncMaimaiFromLxns`
 * 的通知与 `uploadPhase`。服务侧结果已由 `transfer-maimai-from-lxns.test.ts` 覆盖，
 * 但**页面终态**（部分目标失败 / 全部目标失败 / 全部成功）在本文件之前没有任何测试：
 * 仓库内没有测试引用过「部分传输完成」「所有目标均写入失败」这些用户可见文案，
 * `overview-upload-actions.test.tsx` 只覆盖同步与好友码上传入口。
 * 传输服务在这里按合同边界 mock，断言的是页面如何呈现它的结果。
 */
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { useOverviewUpload } from '@/hooks/use-overview-upload';
import { createMaimaiBoundAccount, type BoundAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import type { UploadResult, UploadTargetResult } from '@/services/upload-maimai-from-friend-code';
import { fixtureCatalog } from '@/fixtures/sanitized';

const mockNotification = jest.fn();
const mockTransfer = jest.fn<() => Promise<UploadResult>>();
const mockInvalidate = jest.fn(async () => undefined);
const mockUpdateBoundAccountScore = jest.fn();

jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: mockNotification }),
}));
jest.mock('@/services/transfer-maimai-from-lxns', () => ({
  transferMaimaiFromLxns: () => mockTransfer(),
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
  jest.clearAllMocks();
  mockInvalidate.mockResolvedValue(undefined);
});
afterEach(async () => { await cleanup(); });

describe('总览从落雪传输成绩的页面终态', () => {
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

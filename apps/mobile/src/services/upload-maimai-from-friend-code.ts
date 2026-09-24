import { uploadLatestScoreHubSyncToTargets } from '@/services/upload-maimai-target-write';
import { loginScoreHubWithFriendCode } from '@/services/upload-maimai-login';
import { uploadMaimaiAfterScoreHubToken } from '@/services/upload-maimai-score-fetch';
import type { CatalogSnapshot, ScoreSnapshot } from '@/domain/models';
import type { BoundAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import {
  bindCabinetByQr,
  createCabinetScoreJob,
  fetchActiveCabinetScoreJob,
  fetchMe,
  loginByQrUntilToken,
  pollCabinetScoreJobUntilDone,
  ScoreHubError,
  type QrLoginCredential,
  type ScoreHubAbortSignal,
  type ScoreHubCabinetScoreJob,
} from '@/services/score-hub-client';
import { MAIMAI_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import type { LxnsTokenRotationUpdate } from '@/providers/lxns-oauth-request';
import { scoreHubAccountStore } from '@/storage/score-hub-account-store';
import { waitForForeground } from '@/state/app-lifecycle-core';
import { recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';
import { captureAccountWrites } from '@/services/snapshot-cache-utils';

export { scoreProgressMessage } from '@/services/upload-maimai-score-fetch';

export type UploadPhase =
  | { kind: 'idle' }
  | { kind: 'logging_in'; message: string; authMode?: 'friend_code' | 'qr' | 'session' }
  | { kind: 'sending_friend'; message: string; botFriendCode: string | null }
  | { kind: 'awaiting_friend'; message: string; botFriendCode: string | null }
  | { kind: 'fetching_scores'; message: string }
  | { kind: 'syncing_catalog'; message: string }
  | { kind: 'awaiting_catalog'; message: string }
  | { kind: 'binding'; message: string }
  | { kind: 'uploading'; message: string; providerTitle: string }
  | { kind: 'syncing'; message: string; providerTitle: string }
  | { kind: 'canceling'; message: string }
  | { kind: 'done'; message: string; uploaded: number; skipped: number }
  | { kind: 'error'; message: string };

export type UploadResult = {
  uploaded: number;
  skipped: number;
  refreshedAccounts: { account: BoundAccount; snapshot: ScoreSnapshot; assertCurrent?: () => void }[];
  failedAccountNames: string[];
  targetResults: UploadTargetResult[];
};

export type UploadTaskSnapshot = {
  taskId: string | null;
  status: 'idle' | 'running' | 'paused' | 'done' | 'canceled' | 'error';
  phase: UploadPhase;
  result: UploadResult | null;
};

type CatalogWaiter = {
  promise: Promise<CatalogSnapshot>;
  resolve: (catalog: CatalogSnapshot) => void;
  reject: (error: Error) => void;
  unsubscribeCancel?: () => void;
};

export class UploadTaskController {
  private snapshot: UploadTaskSnapshot = {
    taskId: null,
    status: 'idle',
    phase: { kind: 'idle' },
    result: null,
  };
  private listeners = new Set<(snapshot: UploadTaskSnapshot) => void>();
  private cancelListeners = new Set<() => void>();
  private resumeWaiters = new Set<() => void>();
  private signal: ScoreHubAbortSignal = this.createSignal();
  private catalog: CatalogSnapshot | undefined;
  private requestCatalog: (() => Promise<CatalogSnapshot | undefined>) | undefined;
  private catalogWaiter: CatalogWaiter | null = null;
  private catalogRequest: Promise<void> | null = null;
  private idleResetTimer: ReturnType<typeof setTimeout> | null = null;

  private createSignal(): ScoreHubAbortSignal {
    this.cancelListeners = new Set();
    this.resumeWaiters = new Set();
    const signal: ScoreHubAbortSignal = {
      aborted: false,
      paused: false,
      waitUntilResumed: async () => {
        if (signal.aborted) throw new ScoreHubError('已取消');
        while (signal.paused && !signal.aborted) {
          await new Promise<void>((resolve) => this.resumeWaiters.add(resolve));
        }
        if (signal.aborted) throw new ScoreHubError('已取消');
        await waitForForeground();
        if (signal.aborted) throw new ScoreHubError('已取消');
      },
      onCancel: (listener) => {
        this.cancelListeners.add(listener);
        return () => this.cancelListeners.delete(listener);
      },
    };
    return signal;
  }

  private publish(next: UploadTaskSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener(next);
    void recordRuntimeDiagnostic('task', { taskPhase: next.phase.kind });
  }

  getSnapshot(): UploadTaskSnapshot {
    return this.snapshot;
  }

  getSignal(): ScoreHubAbortSignal {
    return this.signal;
  }

  attachCatalogSource(
    catalog: CatalogSnapshot | undefined,
    requestCatalog?: () => Promise<CatalogSnapshot | undefined>,
  ): void {
    this.catalog = catalog;
    this.requestCatalog = requestCatalog;
  }

  finishCatalogWait(nextCatalog: CatalogSnapshot): void {
    const waiter = this.catalogWaiter;
    if (!waiter) return;
    this.catalogWaiter = null;
    waiter.unsubscribeCancel?.();
    waiter.resolve(nextCatalog);
  }

  private cancelCatalogWait(): void {
    const waiter = this.catalogWaiter;
    if (!waiter) return;
    this.catalogWaiter = null;
    waiter.unsubscribeCancel?.();
    waiter.reject(new ScoreHubError('已取消'));
  }

  private syncCatalogForUpload(): void {
    const waiter = this.catalogWaiter;
    if (!waiter || this.catalogRequest) return;
    this.setPhase({ kind: 'syncing_catalog', message: '成绩已获取，正在同步曲库…' });
    const attempt = Promise.resolve().then(async () => {
      try {
        const nextCatalog = await this.requestCatalog?.();
        if (this.signal.aborted) {
          this.cancelCatalogWait();
          return;
        }
        const availableCatalog = nextCatalog ?? this.catalog;
        if (availableCatalog) {
          this.finishCatalogWait(availableCatalog);
        } else if (this.catalogWaiter === waiter) {
          this.setPhase({ kind: 'awaiting_catalog', message: '成绩已获取，曲库暂未同步。请重试。' });
        }
      } catch {
        if (this.catalogWaiter === waiter && !this.signal.aborted) {
          this.setPhase({ kind: 'awaiting_catalog', message: '成绩已获取，曲库暂未同步。请重试。' });
        }
      } finally {
        if (this.catalogRequest === attempt) this.catalogRequest = null;
        if (this.catalogWaiter && this.catalogWaiter !== waiter && !this.signal.aborted) {
          this.setPhase({ kind: 'awaiting_catalog', message: '成绩已获取，曲库暂未同步。请重试。' });
        }
      }
    });
    this.catalogRequest = attempt;
  }

  waitForCatalog(): Promise<CatalogSnapshot> {
    const availableCatalog = this.catalog;
    if (availableCatalog) return Promise.resolve(availableCatalog);
    if (this.signal.aborted) return Promise.reject(new ScoreHubError('已取消'));
    const existing = this.catalogWaiter;
    if (existing) return existing.promise;

    let resolve!: (nextCatalog: CatalogSnapshot) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<CatalogSnapshot>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });
    const waiter: CatalogWaiter = { promise, resolve, reject };
    waiter.unsubscribeCancel = this.signal.onCancel?.(() => {
      if (this.catalogWaiter === waiter) this.cancelCatalogWait();
    });
    this.catalogWaiter = waiter;
    this.syncCatalogForUpload();
    return promise;
  }

  retryCatalogSync(): void {
    this.syncCatalogForUpload();
  }

  private clearIdleReset(): void {
    if (this.idleResetTimer) {
      clearTimeout(this.idleResetTimer);
      this.idleResetTimer = null;
    }
  }

  begin(): ScoreHubAbortSignal {
    if (this.snapshot.status === 'running' || this.snapshot.status === 'paused') return this.signal;
    this.signal = this.createSignal();
    this.publish({
      taskId: `upload-${Date.now().toString(36)}`,
      status: 'running',
      phase: { kind: 'logging_in', message: '正在准备上传…' },
      result: null,
    });
    return this.signal;
  }

  setPhase(phase: UploadPhase): void {
    this.clearIdleReset();
    const status = phase.kind === 'done' ? 'done' : phase.kind === 'error' ? 'error' : this.snapshot.status;
    this.publish({ ...this.snapshot, phase, status });
    if (phase.kind === 'done') {
      this.idleResetTimer = setTimeout(() => {
        this.idleResetTimer = null;
        this.publish({ ...this.snapshot, phase: { kind: 'idle' } });
      }, 5_000);
    }
  }

  pause(): void {
    if (this.snapshot.status !== 'running') return;
    this.signal.paused = true;
    this.publish({ ...this.snapshot, status: 'paused' });
  }

  resume(): void {
    if (this.snapshot.status !== 'paused') return;
    this.signal.paused = false;
    for (const resolve of this.resumeWaiters) resolve();
    this.resumeWaiters.clear();
    this.publish({ ...this.snapshot, status: 'running' });
  }

  cancel(): void {
    if (this.snapshot.status !== 'running' && this.snapshot.status !== 'paused') return;
    this.signal.aborted = true;
    for (const resolve of this.resumeWaiters) resolve();
    this.resumeWaiters.clear();
    for (const listener of this.cancelListeners) listener();
    this.cancelListeners.clear();
    this.cancelCatalogWait();
    this.publish({ ...this.snapshot, status: 'canceled', phase: { kind: 'canceling', message: '正在取消…' } });
  }

  complete(result: UploadResult): void {
    this.publish({ ...this.snapshot, status: 'done', result });
  }

  fail(phase: UploadPhase): void {
    this.publish({ ...this.snapshot, status: this.signal.aborted ? 'canceled' : 'error', phase });
  }

  subscribe(listener: (snapshot: UploadTaskSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  resetForTests(): void {
    if (this.snapshot.status === 'running' || this.snapshot.status === 'paused') this.cancel();
    this.clearIdleReset();
    this.cancelCatalogWait();
    this.catalog = undefined;
    this.requestCatalog = undefined;
    this.catalogRequest = null;
    this.signal = this.createSignal();
    this.snapshot = { taskId: null, status: 'idle', phase: { kind: 'idle' }, result: null };
  }
}

export const uploadTaskController = new UploadTaskController();

export type BindCabinetResult = {
  friendCode: string;
  alreadyBound: boolean;
};

export type UploadTargetResult = {
  account: BoundAccount;
  status: 'success' | 'failed';
  written: number;
  skipped: number;
  errorMessage?: string;
  refreshFailed?: boolean;
};

export type UploadTarget = {
  account: BoundAccount;
  writable: boolean;
  disableReason: string | null;
};

export const QR_REQUIRES_BIND_MESSAGE =
  '首次使用前请在此绑定玩家二维码。请先到「好友码」上传一次成绩完成登录，再粘贴玩家二维码绑定。';

export function compactUploadPhaseLabel(phase: UploadPhase): string {
  switch (phase.kind) {
    case 'logging_in':
      if (phase.authMode === 'qr') return '确认二维码中';
      if (phase.authMode === 'session') return '获取成绩中';
      return '创建任务中';
    case 'sending_friend':
      return '发送申请中';
    case 'awaiting_friend':
      return '等待同意中';
    case 'fetching_scores':
      return '获取成绩中';
    case 'syncing_catalog':
    case 'awaiting_catalog':
      return '同步曲库中';
    case 'binding':
      return '绑定二维码中';
    case 'uploading':
    case 'syncing':
      return '上传成绩中';
    case 'canceling':
      return '取消中';
    case 'done':
      return '上传完成';
    case 'error':
      return '上传失败';
    case 'idle':
    default:
      return '好友码';
  }
}

/** 好友申请可能延迟出现，需多次刷新列表。 */
export const FRIEND_REQUEST_REFRESH_HINT =
  '好友申请发出后，可能需在“舞萌-中二公众号 → 我的记录 → 舞萌DX”多刷新几次才能看到申请。';

/** 按近一小时公开成功率给出分档提示（rate 为 0–100）。 */
export function scoreHubSuccessHint(rate: number | null, totalCount: number): string {
  if (totalCount <= 0 || rate === null || !Number.isFinite(rate)) {
    return '近一小时暂无公开任务统计，服务状态不明，可稍后再试。';
  }
  if (rate >= 100) return '近一小时同步非常畅通，可以放心上传。';
  if (rate >= 85) return '近一小时成功率良好，通常可顺利完成。';
  if (rate >= 70) return '近一小时成功率一般，可能稍慢，请耐心等待。';
  if (rate >= 50) return '近一小时成功率偏低，建议错峰或多试一次。';
  if (rate >= 30) return '近一小时成功率较差，失败概率较高，建议稍后再试。';
  return '近一小时服务很不稳定，不建议现在上传。';
}

export function formatScoreHubStatsSummary(stats: {
  totalCount: number;
  completedCount: number;
  failedCount: number;
  successRate: number;
  avgDuration: number | null;
} | null): string {
  if (!stats || stats.totalCount <= 0) {
    return '近 1 小时：暂无公开任务样本';
  }
  const rate = Number.isFinite(stats.successRate)
    ? `${stats.successRate.toFixed(stats.successRate % 1 === 0 ? 0 : 1)}%`
    : '—';
  const duration = typeof stats.avgDuration === 'number' && stats.avgDuration > 0
    ? `，平均约 ${Math.max(1, Math.round(stats.avgDuration / 1000))} 秒`
    : '';
  return `近 1 小时成功率 ${rate}（成功 ${stats.completedCount} / 失败 ${stats.failedCount} / 共 ${stats.totalCount}）${duration}`;
}

export function resolveUploadTargets(
  accounts: readonly BoundAccount[],
  sessionsByAccountId: Record<string, ProviderSession | undefined>,
): UploadTarget[] {
  return accounts
    .filter((account) => account.gameId === 'maimai')
    .map((account) => {
      if (account.providerId === 'local') {
        return {
          account,
          writable: true,
          disableReason: null,
        };
      }
      if (account.id === MAIMAI_TEST_ACCOUNT_ID || account.providerId === 'maimai-test') {
        return {
          account,
          writable: false,
          disableReason: '测试成绩由曲库自动生成',
        };
      }
      if (account.providerId === 'lxns') {
        const session = sessionsByAccountId[account.id];
        return {
          account,
          writable: session?.mode === 'lxns-oauth',
          disableReason: session?.mode === 'lxns-oauth' ? null : '请重新授权落雪账号',
        };
      }
      if (account.providerId !== 'diving-fish') {
        return {
          account,
          writable: false,
          disableReason: '不支持的查分器',
        };
      }
      const session = sessionsByAccountId[account.id];
      if (!session || session.mode !== 'import-token') {
        return {
          account,
          writable: false,
          disableReason: '请先用账密绑定水鱼账号',
        };
      }
      return { account, writable: true, disableReason: null };
    });
}

export type UploadCommonInput = {
  selectedAccountIds: string[];
  targets: UploadTarget[];
  sessionsByAccountId: Record<string, ProviderSession | undefined>;
  resolveCatalog: () => Promise<CatalogSnapshot>;
  signal: ScoreHubAbortSignal;
  onPhase: (phase: UploadPhase) => void;
  onLxnsTokensRotated?: (accountId: string, update: LxnsTokenRotationUpdate) => void | Promise<unknown>;
};

function resolveSelectedTargets(input: UploadCommonInput): UploadTarget[] {
  const selected = input.targets.filter(
    (target) => target.writable && input.selectedAccountIds.includes(target.account.id),
  );
  if (selected.length === 0) {
    throw new ScoreHubError('请至少勾选一个可上传的查分器');
  }
  return selected;
}

/** ScoreHub JWT 失效（需回退好友码登录）。 */
export function isScoreHubAuthExpired(error: unknown): boolean {
  return error instanceof ScoreHubError
    && (error.status === 401 || error.status === 403);
}

export async function uploadMaimaiFromFriendCode(input: UploadCommonInput & {
  friendCode: string;
  onNeedFriendAccept: (botFriendCode: string | null) => void;
}): Promise<UploadResult> {
  const friendCode = input.friendCode.trim();
  const selected = resolveSelectedTargets(input);
  const assertAccount = captureAccountWrites(selected.map((target) => target.account));
  const { token, friendshipJobId } = await loginScoreHubWithFriendCode({
    friendCode,
    signal: input.signal,
    onPhase: input.onPhase,
    onNeedFriendAccept: input.onNeedFriendAccept,
  });

  return uploadMaimaiAfterScoreHubToken({
    ...input,
    selected,
    token,
    friendshipJobId,
    playerIdForLocal: friendCode,
    persistFriendCode: friendCode,
    assertAccount,
  });
}

/**
 * 已绑定机台后：复用指定好友码的本地 ScoreHub JWT 直接拉分写出，
 * 不创建 login-requests / 好友申请。
 */
export async function uploadMaimaiWithScoreHubSession(input: UploadCommonInput & {
  expectedFriendCode?: string | null;
}): Promise<UploadResult> {
  const selected = resolveSelectedTargets(input);
  const assertAccount = captureAccountWrites(selected.map((target) => target.account));
  input.onPhase({
    kind: 'logging_in',
    message: '正在使用已登录的 ScoreHub 会话…',
    authMode: 'session',
  });

  const expected = input.expectedFriendCode?.trim() ?? '';
  const entry = expected
    ? await scoreHubAccountStore.getByFriendCode(expected)
    : null;
  const cached = entry
    ? {
      friendCode: entry.friendCode,
      token: entry.token,
      hasCabinetBound: entry.hasCabinetBound,
    }
    : await scoreHubAccountStore.load();

  if (!cached.token) {
    throw new ScoreHubError(
      '尚未登录 ScoreHub。请先完成一次好友码上传登录，再回来拉取成绩。',
      401,
    );
  }

  if (expected && cached.friendCode && expected !== cached.friendCode) {
    throw new ScoreHubError(
      '好友码与当前登录会话不一致，请重新用该好友码登录后再试。',
    );
  }

  let friendCode = cached.friendCode || expected;
  try {
    const me = await fetchMe(cached.token, input.signal);
    friendCode = me.friendCode ?? friendCode;
    await scoreHubAccountStore.upsert({
      friendCode,
      hasCabinetBound: me.hasCabinetUserId || cached.hasCabinetBound,
      token: cached.token,
    });
  } catch (error) {
    if (isScoreHubAuthExpired(error)) {
      throw new ScoreHubError(
        '登录已失效。将改用好友码重新登录。',
        error instanceof ScoreHubError ? error.status : 401,
      );
    }
    // /me 短暂失败时仍尝试用缓存 token 拉分
  }

  if (!friendCode) {
    throw new ScoreHubError(
      '本地会话缺少好友码。请先完成一次好友码上传登录。',
      401,
    );
  }

  try {
    return await uploadMaimaiAfterScoreHubToken({
      ...input,
      selected,
      token: cached.token,
      friendshipJobId: null,
      playerIdForLocal: friendCode,
      persistFriendCode: friendCode,
      assertAccount,
    });
  } catch (error) {
    if (isScoreHubAuthExpired(error)) {
      throw new ScoreHubError(
        '登录已失效。将改用好友码重新登录。',
        error instanceof ScoreHubError ? error.status : 401,
      );
    }
    throw error;
  }
}

export async function uploadMaimaiPreferringSession(input: UploadCommonInput & {
  friendCode: string;
  preferSession: boolean;
  onNeedFriendAccept: (botFriendCode: string | null) => void;
}): Promise<UploadResult> {
  if (input.preferSession) {
    try {
      return await uploadMaimaiWithScoreHubSession({
        ...input,
        expectedFriendCode: input.friendCode.trim(),
      });
    } catch (error) {
      if (input.signal.aborted) throw error;
      if (!isScoreHubAuthExpired(error)) throw error;
      input.onPhase({
        kind: 'logging_in',
        message: '会话已失效，改用好友码重新登录…',
        authMode: 'friend_code',
      });
    }
  }
  return uploadMaimaiFromFriendCode(input);
}

/** 独立绑定玩家二维码：仅用指定好友码的 ScoreHub 会话 PUT /me/cabinet。 */
export async function bindScoreHubCabinetByQr(input: {
  qrCode: string;
  friendCode?: string | null;
  signal: ScoreHubAbortSignal;
  onPhase: (phase: UploadPhase) => void;
}): Promise<BindCabinetResult> {
  const qrCode = input.qrCode.trim();
  if (!qrCode) {
    throw new ScoreHubError('请提供玩家二维码字符串');
  }

  const preferred = input.friendCode?.trim() ?? '';
  const entry = preferred
    ? await scoreHubAccountStore.getByFriendCode(preferred)
    : null;
  const cached = entry
    ? {
      friendCode: entry.friendCode,
      token: entry.token,
      hasCabinetBound: entry.hasCabinetBound,
    }
    : await scoreHubAccountStore.load();

  if (!cached.token) {
    throw new ScoreHubError(
      '尚未登录 ScoreHub。请先完成一次好友码上传，再回来绑定玩家二维码。',
    );
  }

  input.onPhase({ kind: 'binding', message: '正在绑定玩家二维码…' });

  const token = cached.token;
  try {
    await fetchMe(token, input.signal);
  } catch (error) {
    if (isScoreHubAuthExpired(error)) {
      throw new ScoreHubError(
        '登录已失效。请先用好友码再上传一次成绩，然后再绑定玩家二维码。',
        error instanceof ScoreHubError ? error.status : 401,
      );
    }
    // 其他 /me 失败仍尝试绑定；由 bind 接口给出最终错误
  }

  try {
    const bind = await bindCabinetByQr(token, qrCode, input.signal);
    const me = await fetchMe(token, input.signal).catch(() => null);
    const friendCode = me?.friendCode ?? cached.friendCode ?? preferred;
    await scoreHubAccountStore.upsert({
      friendCode,
      hasCabinetBound: true,
      token,
    });

    input.onPhase({
      kind: 'done',
      message: bind.alreadyBound
        ? '正在读取玩家成绩'
        : '玩家二维码已绑定，之后将复用会话快速拉分',
      uploaded: 0,
      skipped: 0,
    });

    return {
      friendCode,
      alreadyBound: bind.alreadyBound,
    };
  } catch (error) {
    if (isScoreHubAuthExpired(error)) {
      throw new ScoreHubError(
        '登录已失效。请先用好友码再上传一次成绩，然后再绑定玩家二维码。',
        error instanceof ScoreHubError ? error.status : 401,
      );
    }
    throw error;
  }
}

export async function uploadMaimaiFromQrLogin(input: UploadCommonInput & {
  credential: QrLoginCredential;
  onQrAccepted?: () => void;
}): Promise<UploadResult> {
  const selected = resolveSelectedTargets(input);
  const assertAccount = captureAccountWrites(selected.map((target) => target.account));
  input.onPhase({
    kind: 'logging_in',
    message: '正在确认玩家二维码…',
    authMode: 'qr',
  });

  let login: { token: string; friendCode: string | null };
  try {
    login = await loginByQrUntilToken({
      credential: input.credential,
      signal: input.signal,
      onProgress: ({ message }) => {
        input.onPhase({ kind: 'logging_in', message, authMode: 'qr' });
      },
    });
  } catch (error) {
    if (error instanceof ScoreHubError
      && (error.code || error.retryable || error.status === 401 || error.status === 403)) {
      throw error;
    }
    throw new ScoreHubError(
      'qr login failed',
      undefined,
      false,
      { code: 'QR_LOGIN_FAILED' },
    );
  }

  const me = await fetchMe(login.token, input.signal);
  const friendCode = me.friendCode ?? login.friendCode;
  if (!me.hasCabinetUserId) {
    throw new ScoreHubError(
      'cabinet account not bound',
      409,
      false,
      { code: 'CABINET_NOT_BOUND' },
    );
  }
  if (friendCode) {
    await scoreHubAccountStore.upsert({
      friendCode,
      hasCabinetBound: true,
      token: login.token,
    });
  }

  let job = await fetchActiveCabinetScoreJob(login.token, input.signal);
  if (!job) {
    try {
      job = await createCabinetScoreJob(login.token, input.credential, input.signal);
    } catch (error) {
      const resumableCodes = new Set([
        'SYNC_IN_PROGRESS',
        'SESSION_CLEANUP_PENDING',
        'SESSION_CLEANUP_UNCONFIRMED',
      ]);
      if (!(error instanceof ScoreHubError) || !error.code || !resumableCodes.has(error.code)) {
        throw error;
      }
      job = await fetchActiveCabinetScoreJob(login.token, input.signal);
      if (!job) throw error;
    }
  }
  input.onQrAccepted?.();
  input.onPhase({ kind: 'fetching_scores', message: cabinetScoreProgressMessage(job) });
  await pollCabinetScoreJobUntilDone({
    token: login.token,
    job,
    signal: input.signal,
    onProgress: (current) => {
      input.onPhase({ kind: 'fetching_scores', message: cabinetScoreProgressMessage(current) });
    },
  });

  const fallbackPlayerId = selected.find((target) => target.account.providerId === 'local')?.account.id
    ?? selected[0]!.account.id;

  return uploadLatestScoreHubSyncToTargets({
    ...input,
    selected,
    token: login.token,
    playerIdForLocal: friendCode ?? fallbackPlayerId,
    persistFriendCode: friendCode,
    assertAccount,
  });
}

function cabinetScoreProgressMessage(job: ScoreHubCabinetScoreJob): string {
  if (job.status === 'failed'
    && (job.cleanupStatus === 'pending' || job.cleanupStatus === 'unconfirmed')) {
    return '正在结束本次读取，请稍候…';
  }
  if (job.stage === 'queued') return '正在等待读取成绩…';
  if (job.stage === 'qr_auth' || job.stage === 'preview' || job.stage === 'login') {
    return '正在确认玩家账号…';
  }
  if (job.stage === 'get_music') {
    return job.progress
      ? `正在读取成绩…（已读取 ${job.progress.detailsFetched} 条）`
      : '正在读取成绩…';
  }
  if (job.stage === 'logout' || job.stage === 'cleanup') {
    return '正在结束本次读取，请稍候…';
  }
  if (job.stage === 'persist') return '正在整理成绩…';
  return '正在完成成绩读取…';
}

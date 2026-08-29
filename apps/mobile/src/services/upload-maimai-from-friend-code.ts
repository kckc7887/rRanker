import type { CatalogSnapshot, ScoreSnapshot } from '@/domain/models';
import type { BoundAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { ProviderError } from '@/providers/errors';
import {
  bindCabinetByQr,
  createCabinetScoreJob,
  createFriendLoginJob,
  createUpdateScoreJob,
  fetchActiveCabinetScoreJob,
  fetchLatestSync,
  fetchMe,
  loginByQrUntilToken,
  pollCabinetScoreJobUntilDone,
  pollLoginUntilToken,
  pollUpdateScoreUntilDone,
  ScoreHubError,
  type QrLoginCredential,
  type ScoreHubAbortSignal,
  type ScoreHubCabinetScoreJob,
  type ScoreHubScoreProgress,
} from '@/services/score-hub-client';
import { uploadRecordsToDivingFish } from '@/services/diving-fish-upload';
import {
  buildMusicTitleMap,
  convertHubScoresToDivingFishRecords,
  convertHubScoresToLocalRecords,
  convertHubScoresToLxnsRecords,
} from '@/services/score-hub-sync-map';
import { MAIMAI_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import { uploadRecordsToLxns } from '@/services/lxns-upload';
import { buildScoreSnapshot } from '@/services/score-service';
import type { LxnsOAuthSession } from '@/providers/lxns-oauth';
import { scoreHubAccountStore } from '@/storage/score-hub-account-store';
import { waitForForeground } from '@/state/app-lifecycle-core';
import { recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';

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
  refreshedAccounts: { account: BoundAccount; snapshot: ScoreSnapshot }[];
  failedAccountNames: string[];
  targetResults: UploadTargetResult[];
};

export type UploadTaskSnapshot = {
  taskId: string | null;
  status: 'idle' | 'running' | 'paused' | 'done' | 'canceled' | 'error';
  phase: UploadPhase;
  result: UploadResult | null;
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
    const status = phase.kind === 'done' ? 'done' : phase.kind === 'error' ? 'error' : this.snapshot.status;
    this.publish({ ...this.snapshot, phase, status });
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

const DIFFICULTY_LABELS: Record<number, string> = {
  0: 'BASIC',
  1: 'ADVANCED',
  2: 'EXPERT',
  3: 'MASTER',
  4: 'Re:MASTER',
  10: '宴会场',
};

export function scoreProgressMessage(progress: ScoreHubScoreProgress | null): string {
  if (!progress || progress.totalDiffs <= 0) return '获取成绩中…';
  const completed = [...new Set(progress.completedDiffs)].sort((left, right) => left - right);
  if (completed.length === 0) {
    return `获取各难度成绩中…（0/${progress.totalDiffs}）`;
  }
  const completedLabels = completed
    .map((difficulty) => DIFFICULTY_LABELS[difficulty] ?? `难度 ${difficulty}`)
    .join('、');
  const count = Math.min(completed.length, progress.totalDiffs);
  if (count >= progress.totalDiffs) {
    return `各难度成绩已获取，正在整理…（${count}/${progress.totalDiffs}）`;
  }
  return `获取成绩中：已完成 ${completedLabels}（${count}/${progress.totalDiffs}）`;
}

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

type UploadCommonInput = {
  selectedAccountIds: string[];
  targets: UploadTarget[];
  sessionsByAccountId: Record<string, ProviderSession | undefined>;
  resolveCatalog: () => Promise<CatalogSnapshot>;
  signal: ScoreHubAbortSignal;
  onPhase: (phase: UploadPhase) => void;
  onLxnsTokensRotated?: (accountId: string, session: LxnsOAuthSession) => void | Promise<void>;
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

async function loginScoreHubWithFriendCode(input: {
  friendCode: string;
  signal: ScoreHubAbortSignal;
  onPhase: (phase: UploadPhase) => void;
  onNeedFriendAccept: (botFriendCode: string | null) => void;
}): Promise<{ token: string; friendshipJobId: string | null }> {
  const friendCode = input.friendCode.trim();
  if (!/^\d{15}$/.test(friendCode)) {
    throw new ScoreHubError('请输入 15 位好友码');
  }

  input.onPhase({
    kind: 'logging_in',
    message: '正在创建好友申请任务…',
    authMode: 'friend_code',
  });
  const login = await createFriendLoginJob(friendCode, input.signal);

  let token: string;
  let friendshipJobId: string | null = null;

  if (typeof login.body.__skipAuthToken === 'string') {
    token = login.body.__skipAuthToken;
  } else {
    friendshipJobId = login.jobId;
    input.onPhase({
      kind: 'sending_friend',
      message: '正在发送好友申请…',
      botFriendCode: login.botFriendCode,
    });
    let alerted = false;
    token = await pollLoginUntilToken({
      jobId: login.jobId,
      signal: input.signal,
      onSendingFriend: ({ botFriendCode }) => {
        input.onPhase({
          kind: 'sending_friend',
          message: '正在发送好友申请…',
          botFriendCode: botFriendCode ?? login.botFriendCode,
        });
      },
      onWaitingFriend: ({ botFriendCode }) => {
        input.onPhase({
          kind: 'awaiting_friend',
          message: '等待同意好友中…请到“舞萌-中二公众号-我的记录-舞萌DX”接受 Bot 好友申请',
          botFriendCode,
        });
        if (!alerted) {
          alerted = true;
          input.onNeedFriendAccept(botFriendCode ?? login.botFriendCode);
        }
      },
    });
  }

  await scoreHubAccountStore.upsert({
    friendCode,
    token,
  });

  return { token, friendshipJobId };
}

/** ScoreHub JWT 失效（需回退好友码登录）。 */
export function isScoreHubAuthExpired(error: unknown): boolean {
  return error instanceof ScoreHubError
    && (error.status === 401 || error.status === 403);
}

async function uploadLatestScoreHubSyncToTargets(input: UploadCommonInput & {
  token: string;
  playerIdForLocal: string;
  selected: UploadTarget[];
  persistFriendCode?: string | null;
}): Promise<UploadResult> {
  const sync = await fetchLatestSync(input.token, input.signal);
  const scores = sync?.scores ?? [];
  if (scores.length === 0) {
    throw new ScoreHubError('未获取到成绩数据');
  }
  const needsDivingFish = input.selected.some((target) => target.account.providerId === 'diving-fish');
  const needsLocal = input.selected.some((target) => target.account.providerId === 'local');
  const catalog = needsDivingFish || needsLocal
    ? await input.resolveCatalog()
    : null;
  if (input.signal.aborted) throw new ScoreHubError('已取消');

  const divingFishMapped = needsDivingFish && catalog
    ? convertHubScoresToDivingFishRecords(scores, buildMusicTitleMap(catalog))
    : null;
  const localMapped = needsLocal && catalog
    ? convertHubScoresToLocalRecords(scores, catalog)
    : null;
  const lxnsMapped = input.selected.some((target) => target.account.providerId === 'lxns')
    ? convertHubScoresToLxnsRecords(scores)
    : null;
  let uploadedTotal = 0;
  let skipped = 0;
  const targetResults: UploadTargetResult[] = [];
  const refreshedAccounts: { account: BoundAccount; snapshot: ScoreSnapshot }[] = [];
  const failedAccountNames: string[] = [];

  for (const target of input.selected) {
    if (input.signal.aborted) throw new ScoreHubError('已取消');
    let written = 0;
    let targetSkipped = 0;
    try {
      input.onPhase({
        kind: 'uploading',
        message: `写入${target.account.displayName}（${target.account.providerTitle}）中…`,
        providerTitle: target.account.providerTitle,
      });
      if (target.account.providerId === 'local') {
        if (!localMapped || !catalog) {
          throw new ProviderError('no_data', '未能准备本地成绩', false);
        }
        targetSkipped = localMapped.skippedNoSong
          + localMapped.skippedBadScore
          + localMapped.skippedUnsupportedChart;
        if (localMapped.records.length === 0) {
          throw new ProviderError('no_data', '没有可保存到本地的成绩', false);
        }
        const source = {
          kind: 'local' as const,
          label: '本地查分器',
          updatedAt: new Date().toISOString(),
          isStale: false,
        };
        const snapshot = buildScoreSnapshot({
          id: input.playerIdForLocal,
          displayName: target.account.displayName,
          rating: 0,
          additionalRating: 0,
          source,
        }, localMapped.records, catalog);
        const { SqliteSnapshotRepository } = await import('@/storage/sqlite-snapshot-repository');
        await new SqliteSnapshotRepository().save(target.account.id, snapshot);
        refreshedAccounts.push({ account: target.account, snapshot });
        written = localMapped.records.length;
      } else if (target.account.providerId === 'diving-fish') {
        if (!divingFishMapped) {
          throw new ProviderError('no_data', '未能准备水鱼成绩', false);
        }
        targetSkipped = divingFishMapped.skippedNoTitle
          + divingFishMapped.skippedBadScore
          + divingFishMapped.skippedUnsupportedChart;
        const session = input.sessionsByAccountId[target.account.id];
        if (!session || session.mode !== 'import-token') {
          throw new ProviderError('authentication', '水鱼上传需要 Import-Token', false);
        }
        const result = await uploadRecordsToDivingFish(
          session.value,
          divingFishMapped.records,
          input.signal,
        );
        written = result.uploaded;
      } else if (target.account.providerId === 'lxns') {
        if (!lxnsMapped) {
          throw new ProviderError('no_data', '未能准备落雪成绩', false);
        }
        targetSkipped = lxnsMapped.skippedNoSong
          + lxnsMapped.skippedBadScore
          + lxnsMapped.skippedUnsupportedChart;
        const session = input.sessionsByAccountId[target.account.id];
        if (!session || session.mode !== 'lxns-oauth') {
          throw new ProviderError('authentication', '落雪上传需要 OAuth 授权', false);
        }
        const result = await uploadRecordsToLxns({
          session,
          records: lxnsMapped.records,
          signal: input.signal,
          onTokensRotated: (next) => input.onLxnsTokensRotated?.(target.account.id, next),
        });
        written = result.uploaded;
      }
      uploadedTotal += written;
      skipped += targetSkipped;
      targetResults.push({
        account: target.account,
        status: 'success',
        written,
        skipped: targetSkipped,
      });
    } catch (error) {
      if (input.signal.aborted) throw new ScoreHubError('已取消');
      const message = error instanceof Error ? error.message : '写入失败';
      skipped += targetSkipped;
      targetResults.push({
        account: target.account,
        status: 'failed',
        written: 0,
        skipped: targetSkipped,
        errorMessage: message,
      });
    }
  }
  if (input.signal.aborted) throw new ScoreHubError('已取消');

  const failedTargets = targetResults.filter((item) => item.status === 'failed');
  if (targetResults.every((item) => item.status === 'failed')) {
    input.onPhase({
      kind: 'error',
      message: `写入失败：${failedTargets.map((item) => item.account.displayName).join('、')}，请重试。`,
    });
    return {
      uploaded: uploadedTotal,
      skipped,
      refreshedAccounts,
      failedAccountNames,
      targetResults,
    };
  }

  input.onPhase({
    kind: 'done',
    message: failedTargets.length > 0
      ? `部分完成：写入 ${uploadedTotal} 条；失败 ${failedTargets.map((item) => item.account.displayName).join('、')}`
      : skipped > 0
        ? `完成：写入 ${uploadedTotal} 条，跳过 ${skipped} 条`
        : `完成：写入 ${uploadedTotal} 条`,
    uploaded: uploadedTotal,
    skipped,
  });
  return {
    uploaded: uploadedTotal,
    skipped,
    refreshedAccounts,
    failedAccountNames,
    targetResults,
  };
}

async function uploadMaimaiAfterScoreHubToken(input: UploadCommonInput & {
  token: string;
  friendshipJobId: string | null;
  playerIdForLocal: string;
  selected: UploadTarget[];
  persistFriendCode?: string | null;
}): Promise<UploadResult> {
  input.onPhase({ kind: 'fetching_scores', message: '获取各难度成绩中…' });
  const scoreJobId = await createUpdateScoreJob(input.token, input.friendshipJobId, input.signal);
  await pollUpdateScoreUntilDone({
    token: input.token,
    jobId: scoreJobId,
    signal: input.signal,
    onProgress: ({ progress, stage }) => {
      if (typeof stage === 'string' && stage.includes('重试')) {
        input.onPhase({ kind: 'fetching_scores', message: stage });
        return;
      }
      input.onPhase({ kind: 'fetching_scores', message: scoreProgressMessage(progress) });
    },
  });
  return uploadLatestScoreHubSyncToTargets(input);
}

export async function uploadMaimaiFromFriendCode(input: UploadCommonInput & {
  friendCode: string;
  onNeedFriendAccept: (botFriendCode: string | null) => void;
}): Promise<UploadResult> {
  const friendCode = input.friendCode.trim();
  const selected = resolveSelectedTargets(input);
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

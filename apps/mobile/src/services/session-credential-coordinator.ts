import type { ProviderSession, RizlineSession } from '@/providers/contracts';
import type { LxnsTokenRotationUpdate } from '@/providers/lxns-oauth-request';
import { lxnsRotationAncestors } from '@/providers/lxns-oauth';
import { osuRotationAncestors } from '@/providers/osu-oauth';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';
import { sessionRuntime, setLxnsTokenRotation } from '@/state/session-runtime';

type OsuOAuthSession = Extract<ProviderSession, { mode: 'osu-oauth' }>;
/** 可轮换的 OAuth 会话：落雪与 osu! 共用同一套凭据世代判定。 */
type RotatableOAuthSession = Extract<ProviderSession, { mode: 'lxns-oauth' | 'osu-oauth' }>;

type SessionsByAccountId = Record<string, ProviderSession>;

/**
 * 协调器读写的账号状态面：只包含凭据提交关心的规范数据与派生视图。
 * 不 import Store 模块，装配方把 `useSession.getState` / `setState` 传进来。
 */
export type SessionCredentialState = {
  sessionsByAccountId: SessionsByAccountId;
  credentialIdsByAccountId: Record<string, string>;
  boundAccounts: readonly { id: string }[];
  activeAccountId: string;
  session: ProviderSession | null;
};

export type SessionStoreApi = {
  getState(): SessionCredentialState;
  setState(partial: {
    sessionsByAccountId?: SessionsByAccountId;
    session?: ProviderSession | null;
  }): void;
  /** 规范数据变更后按同一份会话状态重建激活账号的派生视图。 */
  refreshActiveSessionView(sessionsByAccountId?: SessionsByAccountId): void;
};

/** OAuth 轮换提交结果：pending-persist 表示内存已更新、本机落盘失败待补写。 */
export type OAuthRotationCommitResult = 'applied' | 'pending-persist' | 'stale' | 'removed';

/** 落盘失败仍待提交的轮换：上游已消费旧 refresh token，不能再重新刷新一次。 */
type PendingRotationWrite = {
  accountId: string;
  session: RotatableOAuthSession;
  acceptedRefreshTokens: readonly string[];
  attempts: number;
};

/** 一个协议的轮换世代规则：协议差异只体现在 refresh token 的前代关系里。 */
type OAuthRotationLineage = {
  /** 本协议可轮换会话的模式，用于把别的协议会话排除在世代判定外。 */
  mode: RotatableOAuthSession['mode'];
  ancestors: (nextRefreshToken: string) => readonly string[];
};

const LXNS_ROTATION_LINEAGE: OAuthRotationLineage = {
  mode: 'lxns-oauth',
  ancestors: lxnsRotationAncestors,
};

const OSU_ROTATION_LINEAGE: OAuthRotationLineage = {
  mode: 'osu-oauth',
  ancestors: osuRotationAncestors,
};

/** 有界退避：3 次自动补写后停止，保留可观察摘要等待下次显式触发。 */
const PENDING_ROTATION_RETRY_DELAYS_MS = [5_000, 30_000, 120_000] as const;

/** 仍关联某个凭据的账号，按凭据去重后取当前内存会话。 */
function sessionsByCredential(
  sessionsByAccountId: SessionsByAccountId,
  credentialIdsByAccountId: Record<string, string>,
): Map<string, ProviderSession> {
  const byCredential = new Map<string, ProviderSession>();
  for (const [accountId, credentialId] of Object.entries(credentialIdsByAccountId)) {
    const session = sessionsByAccountId[accountId];
    if (session && !byCredential.has(credentialId)) byCredential.set(credentialId, session);
  }
  return byCredential;
}

/**
 * 解析本次轮换应提交到哪个凭据：以请求开始时消费掉的会话世代为准，
 * 而不是发起账号当前指向的凭据，因此同 ID 重绑、重新授权、发起账号被解绑
 * （共享凭据仍被其它账号引用）都不会写到错误的凭据上。
 */
function resolveRotationCredential(
  sessionsByAccountId: SessionsByAccountId,
  credentialIdsByAccountId: Record<string, string>,
  lineage: OAuthRotationLineage,
  acceptedRefreshTokens: readonly string[],
): string | null {
  for (const [credentialId, session] of sessionsByCredential(sessionsByAccountId, credentialIdsByAccountId)) {
    if (session.mode !== lineage.mode) continue;
    if (acceptedRefreshTokens.includes(session.refreshToken)) return credentialId;
  }
  return null;
}

/** 只更新仍关联该凭据的账号；发起账号已被解绑时不会把它的会话写回来。 */
function sessionsForCredentialUpdate(
  sessionsByAccountId: SessionsByAccountId,
  credentialIdsByAccountId: Record<string, string>,
  credentialId: string,
  session: ProviderSession,
): SessionsByAccountId {
  const next = { ...sessionsByAccountId };
  for (const [linkedAccountId, linkedCredentialId] of Object.entries(credentialIdsByAccountId)) {
    if (linkedCredentialId === credentialId) next[linkedAccountId] = session;
  }
  return next;
}

/** 仍引用某个凭据的账号：Provider 实例按账号缓存，轮换后这些账号的实例都必须失效。 */
function accountIdsForCredential(
  credentialIdsByAccountId: Record<string, string>,
  credentialId: string,
): string[] {
  return Object.entries(credentialIdsByAccountId)
    .filter(([, linkedCredentialId]) => linkedCredentialId === credentialId)
    .map(([accountId]) => accountId);
}

function sameRizlineToken(current: ProviderSession | undefined, expected: RizlineSession): boolean {
  return current?.mode === 'rizline' && current.token === expected.token;
}

/**
 * 安全存储端口：协调器是凭据落盘的唯一入口，Store 不直接访问 SecureStore。
 * 动态加载让测试的模块 mock 继续生效，也避免会话 Store 的静态依赖里出现存储实现。
 */
async function credentialPort(): Promise<{
  updateCredentialSession: (
    credentialId: string,
    session: ProviderSession,
    options?: { acceptedRefreshTokens?: readonly string[] },
  ) => Promise<'applied' | 'stale' | 'missing'>;
  updateAccountSession: (
    accountId: string,
    session: ProviderSession,
    options?: { expected?: ProviderSession; signal?: AbortSignal },
  ) => Promise<void>;
}> {
  const { SecureSessionStore } = await import('@/storage/secure-session-store');
  return new SecureSessionStore();
}

/**
 * 凭据提交协调器：负责轮换资格判定、落盘与发布。
 * 落盘经安全存储端口，发布只改内存会话并释放受影响的 Provider 缓存；
 * 内存发布只覆盖仍关联该凭据的账号，不把已解绑账号的会话写回。
 */
export class SessionCredentialCoordinator {
  private pendingRotationWrites = new Map<string, PendingRotationWrite>();
  private pendingRotationRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRotationRetryInFlight: Promise<number> | null = null;

  constructor(private readonly store: SessionStoreApi) {
    // 落雪 Provider 持有一个把轮换结果交回协调器的回调：装配点在这里，解析器不自行判定世代。
    setLxnsTokenRotation((accountId, update) => this.applyLxnsTokenRotation(accountId, update));
  }

  /** 仍未落盘的轮换摘要（凭据 id、发起账号、已尝试次数）；不包含 token 本身。 */
  pendingRotationWritesSnapshot(): readonly {
    credentialId: string;
    accountId: string;
    attempts: number;
  }[] {
    return [...this.pendingRotationWrites].map(([credentialId, entry]) => ({
      credentialId,
      accountId: entry.accountId,
      attempts: entry.attempts,
    }));
  }

  private schedulePendingRotationRetry(): void {
    if (this.pendingRotationWrites.size === 0 || this.pendingRotationRetryTimer !== null) return;
    const pendingAttempts = [...this.pendingRotationWrites.values()].map((entry) => entry.attempts);
    const delay = PENDING_ROTATION_RETRY_DELAYS_MS[
      Math.min(Math.min(...pendingAttempts), PENDING_ROTATION_RETRY_DELAYS_MS.length - 1)
    ]!;
    this.pendingRotationRetryTimer = setTimeout(() => {
      this.pendingRotationRetryTimer = null;
      void this.retryPendingRotationWrites();
    }, delay);
    // 定时器不应阻止进程或测试退出。
    (this.pendingRotationRetryTimer as unknown as { unref?: () => void }).unref?.();
  }

  /**
   * 补写仍挂起的轮换。幂等：同一时刻只跑一次；单项成功或已过期就丢弃，
   * 落盘继续失败按有界退避重试，超过上限后留下可观察摘要不再自动重试。
   */
  async retryPendingRotationWrites(): Promise<number> {
    if (this.pendingRotationRetryInFlight) return this.pendingRotationRetryInFlight;
    if (this.pendingRotationWrites.size === 0) return 0;
    const attempt = (async () => {
      const port = await credentialPort();
      let applied = 0;
      for (const [credentialId, entry] of [...this.pendingRotationWrites]) {
        try {
          const result = await port.updateCredentialSession(credentialId, entry.session, {
            acceptedRefreshTokens: entry.acceptedRefreshTokens,
          });
          if (result === 'applied') {
            applied += 1;
            this.pendingRotationWrites.delete(credentialId);
            void recordRuntimeDiagnostic('session', { credentialWrite: 'applied' });
            continue;
          }
          // 已不属于该世代、或凭据与关联账号都已消失：过期任务不再补写。
          this.pendingRotationWrites.delete(credentialId);
          void recordRuntimeDiagnostic('session', { credentialWrite: 'dropped', reason: result });
        } catch {
          const attempts = entry.attempts + 1;
          if (attempts > PENDING_ROTATION_RETRY_DELAYS_MS.length) {
            this.pendingRotationWrites.delete(credentialId);
            void recordRuntimeDiagnostic('session', { credentialWrite: 'abandoned', attempts });
          } else {
            this.pendingRotationWrites.set(credentialId, { ...entry, attempts });
            void recordRuntimeDiagnostic('session', { credentialWrite: 'retry-scheduled', attempts });
          }
        }
      }
      if (this.pendingRotationWrites.size > 0) this.schedulePendingRotationRetry();
      return applied;
    })().finally(() => {
      this.pendingRotationRetryInFlight = null;
    });
    this.pendingRotationRetryInFlight = attempt;
    return attempt;
  }

  /** 提交一次 OAuth 轮换：只更新仍关联该凭据的账号，落盘失败转入有界补写。 */
  private async commitOAuthRotation(input: {
    accountId: string;
    lineage: OAuthRotationLineage;
    next: RotatableOAuthSession;
    acceptedRefreshTokens: readonly string[];
  }): Promise<OAuthRotationCommitResult> {
    const state = this.store.getState();
    const credentialId = resolveRotationCredential(
      state.sessionsByAccountId,
      state.credentialIdsByAccountId,
      input.lineage,
      input.acceptedRefreshTokens,
    );
    if (!credentialId) {
      // 发起账号已不在绑定列表且没有账号仍引用该凭据时按已移除处理，否则视为过期结果。
      return state.credentialIdsByAccountId[input.accountId] ? 'stale' : 'removed';
    }
    const sessionsByAccountId = sessionsForCredentialUpdate(
      state.sessionsByAccountId,
      state.credentialIdsByAccountId,
      credentialId,
      input.next,
    );
    const linkedAccountIds = accountIdsForCredential(state.credentialIdsByAccountId, credentialId);
    // 凭据版本变了：仍引用该凭据的账号必须重建 Provider（含持有会话的落雪 Provider）。
    sessionRuntime().release(linkedAccountIds);
    this.store.setState({
      sessionsByAccountId,
      session: sessionsByAccountId[state.activeAccountId] ?? state.session,
    });
    // 激活账号不在受影响集合里时，派生视图无需改动，也就没有第二次提交。
    if (linkedAccountIds.includes(state.activeAccountId)) this.store.refreshActiveSessionView(sessionsByAccountId);
    const port = await credentialPort();
    try {
      const result = await port.updateCredentialSession(credentialId, input.next, {
        acceptedRefreshTokens: input.acceptedRefreshTokens,
      });
      if (result === 'applied') this.pendingRotationWrites.delete(credentialId);
      return result === 'applied' ? 'applied' : result === 'stale' ? 'stale' : 'removed';
    } catch {
      // 本机落盘失败时保留内存中的新会话并登记补写：上游已消费旧 refresh token，
      // 再次刷新只会失败。进程退出前仍未保存成功时用户可能需要重新授权。
      this.pendingRotationWrites.set(credentialId, {
        accountId: input.accountId,
        session: input.next,
        acceptedRefreshTokens: input.acceptedRefreshTokens,
        attempts: 0,
      });
      this.schedulePendingRotationRetry();
      void recordRuntimeDiagnostic('session', { credentialWrite: 'pending' });
      return 'pending-persist';
    }
  }

  /**
   * 落雪令牌轮换提交：必须携带请求开始时使用的会话（凭据世代）。
   * 只有当前仍关联该凭据、且会话属于本次轮换世代的账号接受新令牌；
   * 发起账号被解绑不会丢弃其它账号仍需的新令牌，新授权也不会被旧轮换覆盖。
   */
  async applyLxnsTokenRotation(
    accountId: string,
    update: LxnsTokenRotationUpdate,
  ): Promise<OAuthRotationCommitResult> {
    // 先补交上次落盘失败的轮换，再提交本次结果。
    await this.retryPendingRotationWrites();
    return this.commitOAuthRotation({
      accountId,
      lineage: LXNS_ROTATION_LINEAGE,
      next: update.next,
      acceptedRefreshTokens: [
        update.previous.refreshToken,
        ...lxnsRotationAncestors(update.next.refreshToken),
      ],
    });
  }

  /**
   * osu! 令牌轮换：与落雪共用凭据世代提交规则，只更新仍关联该凭据的模式账号。
   * osu! 的 refresh token 单次使用，因此提交必须携带发起时持有的会话（expected）；
   * 拿不到 expected 时只允许幂等重写当前已存在的同一个会话。
   */
  async applyOsuTokenRotation(
    accountId: string,
    next: OsuOAuthSession,
    expected?: OsuOAuthSession,
  ): Promise<OAuthRotationCommitResult> {
    await this.retryPendingRotationWrites();
    return this.commitOAuthRotation({
      accountId,
      lineage: OSU_ROTATION_LINEAGE,
      next,
      acceptedRefreshTokens: [
        expected?.refreshToken ?? next.refreshToken,
        ...osuRotationAncestors(next.refreshToken),
      ],
    });
  }

  /** Rizline 会话轮换：先按世代校验并落盘，再发布到内存。 */
  async applyRizlineSessionRotation(
    accountId: string,
    next: RizlineSession,
    expected: RizlineSession,
    signal?: AbortSignal,
  ): Promise<void> {
    const assertCurrent = captureResourceWrites('rizline', signal, accountId);
    assertCurrent();
    if (!sameRizlineToken(this.store.getState().sessionsByAccountId[accountId], expected)) return;
    const port = await credentialPort();
    assertCurrent();
    await port.updateAccountSession(accountId, next, { expected, signal });
    assertCurrent();
    const state = this.store.getState();
    if (!sameRizlineToken(state.sessionsByAccountId[accountId], expected)
      || !state.boundAccounts.some((account) => account.id === accountId)) return;
    const credentialId = state.credentialIdsByAccountId[accountId];
    const linkedAccountIds = credentialId
      ? accountIdsForCredential(state.credentialIdsByAccountId, credentialId)
      : [accountId];
    const sessionsByAccountId = credentialId
      ? sessionsForCredentialUpdate(state.sessionsByAccountId, state.credentialIdsByAccountId, credentialId, next)
      : { ...state.sessionsByAccountId, [accountId]: next };
    sessionRuntime().release(linkedAccountIds);
    this.store.setState({
      sessionsByAccountId,
      session: sessionsByAccountId[state.activeAccountId] ?? state.session,
    });
    if (linkedAccountIds.includes(state.activeAccountId)) this.store.refreshActiveSessionView(sessionsByAccountId);
  }

  /** 测试用：清空挂起轮换与定时器。 */
  resetPendingRotationWritesForTests(): void {
    this.pendingRotationWrites.clear();
    if (this.pendingRotationRetryTimer !== null) {
      clearTimeout(this.pendingRotationRetryTimer);
      this.pendingRotationRetryTimer = null;
    }
    this.pendingRotationRetryInFlight = null;
  }
}

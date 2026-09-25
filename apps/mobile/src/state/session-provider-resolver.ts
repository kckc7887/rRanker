import type { BoundAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import type { LxnsTokenRotationUpdate } from '@/providers/lxns-oauth-request';
import {
  createSessionProviders,
  type LxnsTokenRotation,
  type SessionProviders,
} from '@/services/session-providers';

/** 已解析的会话 Provider 对：成绩与详细曲库能力。 */
export type SessionProfiles = SessionProviders;

/** 账号当前引用的凭据：id 与内存会话都参与缓存版本。 */
export type SessionCredentialRef = {
  id?: string | null;
  session: ProviderSession | null;
};

/** 解析结果：Provider 实例与生成它的缓存键。 */
export type ResolvedSessionProviders = {
  cacheKey: string;
  accountId: string;
  providers: SessionProfiles;
};

export type { LxnsTokenRotation, LxnsTokenRotationUpdate };

/** 会话内容指纹：字段顺序无关，只用于判断凭据版本是否变化。 */
function sessionFingerprint(session: ProviderSession | null): string {
  if (!session) return 'none';
  const entries = Object.entries(session as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  return entries.join('&');
}

/**
 * 缓存键 = 账号身份与展示名 + 账号引用的凭据版本与凭据 id。
 * 账号展示名在实例里被读取（本地 Provider 的玩家名），所以改名必须换实例；
 * 分数展示、头像等展示字段不进键，避免每次刷新元数据都重建 Provider。
 */
export function providerResolverCacheKey(
  account: BoundAccount | null,
  credentials: SessionCredentialRef,
): string {
  if (!account?.providerId) return 'unbound';
  return [
    account.id,
    account.gameId,
    account.providerId,
    account.displayName,
    credentials.id ?? 'none',
    sessionFingerprint(credentials.session),
  ].join('\u0000');
}

const resolvedProviders = new Map<string, ResolvedSessionProviders>();
let createdCount = 0;

/**
 * 按「账号 + 凭据版本」缓存必要实例：同一键复用同一个实例，
 * 持有会话等必要运行态的 Provider 不会在每次 render 时重建。
 * 失效条件只有三种：release（解绑/清空）、凭据版本变化、账号身份或展示名变化。
 */
export function resolveSessionProviders(
  account: BoundAccount | null,
  credentials: SessionCredentialRef,
  onLxnsTokenRotation: LxnsTokenRotation = () => undefined,
): ResolvedSessionProviders {
  const cacheKey = providerResolverCacheKey(account, credentials);
  const cached = resolvedProviders.get(cacheKey);
  if (cached) return cached;
  createdCount += 1;
  const entry: ResolvedSessionProviders = {
    cacheKey,
    accountId: account?.id ?? '',
    providers: createSessionProviders(account, credentials.session, onLxnsTokenRotation),
  };
  // 同一账号只保留当前版本，解绑/换绑不会在内存里堆积历史实例。
  for (const [key, value] of resolvedProviders) {
    if (value.accountId && value.accountId === entry.accountId) resolvedProviders.delete(key);
  }
  resolvedProviders.set(cacheKey, entry);
  return entry;
}

/** 解绑、清空会话或提交轮换后释放实例：下一次解析必然重建。 */
export function releaseResolvedProviders(accountIds: readonly string[]): void {
  if (accountIds.length === 0) return;
  const released = new Set(accountIds);
  for (const [key, value] of resolvedProviders) {
    if (released.has(value.accountId)) resolvedProviders.delete(key);
  }
}

export function providerResolverStats(): { entries: number; created: number } {
  return { entries: resolvedProviders.size, created: createdCount };
}

/** 测试用：清空缓存与计数器。 */
export function resetProviderResolverForTests(): void {
  resolvedProviders.clear();
  createdCount = 0;
}

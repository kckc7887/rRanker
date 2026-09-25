import { buildLxnsIconUrl, accountAvatarResourceKey } from '@/domain/account-avatar';
import { tufPlayerIdFromAccountId, type BoundAccount } from '@/domain/bound-account';
import {
  buildChunithmMapIconUrl,
  CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
  chunithmPersonalResourceKey,
  type ChunithmPersonalSnapshot,
} from '@/domain/chunithm-personal';
import type { ScoreSnapshot } from '@/domain/models';
import { resolveTufAvatarUrl, type TufPlayer } from '@/domain/tuf';
import type { ProviderSession } from '@/providers/contracts';
import type { PhigrosScoreProvider } from '@/providers/phigros-score-provider';

const AVATAR_RESOURCE_SCHEMA = 1;
const AVATAR_SYNC_CONCURRENCY = 3;

export type StoredAccountAvatar = {
  avatarUrl: string;
};

export type PhigrosAccountHydration = {
  summary: Awaited<ReturnType<PhigrosScoreProvider['getSummary']>>;
  avatarUrl: string | null;
};

/**
 * 头像解析端口：仓储、协议客户端、会话轮换、落盘与前台信号都由组合入口提供。
 * 解析逻辑本身只依赖这些端口，可在 React Native 之外用少量假实现验证。
 */
export type AccountAvatarResolverPorts = {
  /** 持久化快照与资源读取。 */
  snapshots: {
    latest(accountId: string): Promise<ScoreSnapshot | null>;
    resource<T>(key: string, schemaVersion: number): Promise<T | null>;
  };
  /** 协议客户端：只暴露头像解析需要的读取。 */
  providers: {
    lxnsIconId(session: ProviderSession, accountId: string, signal: AbortSignal): Promise<number | null | undefined>;
    chunithmMapIconId(session: ProviderSession, accountId: string, signal: AbortSignal): Promise<number | null | undefined>;
    phigrosAccount(account: BoundAccount, session: ProviderSession, signal: AbortSignal): Promise<PhigrosAccountHydration>;
  };
  /** TUF 公开资料缓存与拉取；拉取未取消时由实现落盘快照。 */
  tuf: {
    cachedPlayer(playerId: number): Promise<TufPlayer | null>;
    refreshPlayer(playerId: number, signal: AbortSignal): Promise<TufPlayer>;
  };
  /** 账号头像落盘。 */
  persistAvatar(accountId: string, avatarUrl: string): Promise<void>;
  foregroundSignal(): AbortSignal;
};

export type AccountAvatarResolver = {
  hydratePhigrosAccount(
    account: BoundAccount,
    session: ProviderSession,
    signal?: AbortSignal,
  ): Promise<PhigrosAccountHydration>;
  resolveAccountAvatarUrl(
    account: BoundAccount,
    session: ProviderSession | undefined,
    signal?: AbortSignal,
  ): Promise<string | null>;
  syncAllAccountAvatars(
    accounts: readonly BoundAccount[],
    sessionsByAccountId: Readonly<Record<string, ProviderSession>>,
    update: (accountId: string, avatarUrl: string) => void,
    signal?: AbortSignal,
  ): Promise<void>;
};

export function createAccountAvatarResolver(ports: AccountAvatarResolverPorts): AccountAvatarResolver {
  const accountAvatarInflight = new Map<string, Promise<string | null>>();
  const phigrosSummaryInflight = new Map<string, Promise<PhigrosAccountHydration>>();
  const phigrosSummaryCache = new Map<string, PhigrosAccountHydration>();

  function hydratePhigrosAccount(
    account: BoundAccount,
    session: ProviderSession,
    signal: AbortSignal = ports.foregroundSignal(),
  ): Promise<PhigrosAccountHydration> {
    const cached = phigrosSummaryCache.get(account.id);
    if (cached) return Promise.resolve(cached);
    const existing = phigrosSummaryInflight.get(account.id);
    if (existing) return existing;
    const pending = (async () => {
      if (signal.aborted || session.mode !== 'phi-session') throw new Error('account hydration aborted');
      const result = await ports.providers.phigrosAccount(account, session, signal);
      if (signal.aborted) throw new Error('account hydration aborted');
      if (!signal.aborted) phigrosSummaryCache.set(account.id, result);
      return result;
    })();
    phigrosSummaryInflight.set(account.id, pending);
    void pending.finally(() => {
      if (phigrosSummaryInflight.get(account.id) === pending) phigrosSummaryInflight.delete(account.id);
    }).catch(() => undefined);
    return pending;
  }

  function readCachedAvatarUrl(accountId: string): Promise<string | null> {
    return ports.snapshots
      .resource<StoredAccountAvatar>(accountAvatarResourceKey(accountId), AVATAR_RESOURCE_SCHEMA)
      .then((cached) => cached?.avatarUrl ?? null);
  }

  async function resolveLxnsAvatarUrl(
    account: BoundAccount,
    session: ProviderSession | undefined,
    signal: AbortSignal,
  ): Promise<string | null> {
    const fromSnapshot = account.gameId === 'chunithm'
      ? buildChunithmMapIconUrl((
        await ports.snapshots.resource<ChunithmPersonalSnapshot>(
          chunithmPersonalResourceKey(account.id),
          CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
        )
      )?.player?.map_icon?.id)
      : buildLxnsIconUrl((await ports.snapshots.latest(account.id))?.player.presentation?.iconId);
    if (fromSnapshot) return fromSnapshot;

    if (session?.mode !== 'lxns-oauth') return null;

    try {
      if (account.gameId === 'chunithm') {
        return buildChunithmMapIconUrl(await ports.providers.chunithmMapIconId(session, account.id, signal));
      }
      return buildLxnsIconUrl(await ports.providers.lxnsIconId(session, account.id, signal));
    } catch {
      return null;
    }
  }

  async function resolvePhigrosAvatarUrlForAccount(
    account: BoundAccount,
    session: ProviderSession | undefined,
    signal: AbortSignal,
  ): Promise<string | null> {
    const cached = await readCachedAvatarUrl(account.id);
    if (cached) return cached;

    if (session?.mode !== 'phi-session') return null;

    try {
      return (await hydratePhigrosAccount(account, session, signal)).avatarUrl;
    } catch {
      return null;
    }
  }

  async function resolveTufAvatarUrlForAccount(
    account: BoundAccount,
    signal: AbortSignal,
  ): Promise<string | null> {
    const persisted = await readCachedAvatarUrl(account.id);
    if (persisted) return persisted;
    const playerId = tufPlayerIdFromAccountId(account.id);
    if (playerId === null) return null;
    try {
      const cachedAvatar = resolveTufAvatarUrl(await ports.tuf.cachedPlayer(playerId));
      if (cachedAvatar) return cachedAvatar;
      return resolveTufAvatarUrl(await ports.tuf.refreshPlayer(playerId, signal));
    } catch {
      return null;
    }
  }

  function resolveAccountAvatarUrl(
    account: BoundAccount,
    session: ProviderSession | undefined,
    signal: AbortSignal = ports.foregroundSignal(),
  ): Promise<string | null> {
    const existing = accountAvatarInflight.get(account.id);
    if (existing) return existing;
    const pending = (async () => {
      if (signal.aborted) return null;
      const avatarUrl = account.providerId === 'lxns'
        ? await resolveLxnsAvatarUrl(account, session, signal)
        : account.providerId === 'phi-taptap'
          ? await resolvePhigrosAvatarUrlForAccount(account, session, signal)
          : account.providerId === 'tuf'
            ? await resolveTufAvatarUrlForAccount(account, signal)
            : null;
      return signal.aborted ? null : avatarUrl;
    })();
    accountAvatarInflight.set(account.id, pending);
    void pending.finally(() => {
      if (accountAvatarInflight.get(account.id) === pending) accountAvatarInflight.delete(account.id);
    }).catch(() => undefined);
    return pending;
  }

  async function syncAllAccountAvatars(
    accounts: readonly BoundAccount[],
    sessionsByAccountId: Readonly<Record<string, ProviderSession>>,
    update: (accountId: string, avatarUrl: string) => void,
    signal: AbortSignal = ports.foregroundSignal(),
  ): Promise<void> {
    const pending = accounts.filter((account) => (
      (account.providerId === 'lxns' || account.providerId === 'phi-taptap' || account.providerId === 'tuf')
      && !account.avatarUrl
    ));
    let nextIndex = 0;
    const worker = async () => {
      while (!signal.aborted) {
        const account = pending[nextIndex];
        nextIndex += 1;
        if (!account) return;
        const avatarUrl = await resolveAccountAvatarUrl(account, sessionsByAccountId[account.id], signal);
        if (!avatarUrl || signal.aborted) continue;

        update(account.id, avatarUrl);
        await ports.persistAvatar(account.id, avatarUrl);
      }
    };
    await Promise.all(Array.from({ length: Math.min(AVATAR_SYNC_CONCURRENCY, pending.length) }, () => worker()));
  }

  return { hydratePhigrosAccount, resolveAccountAvatarUrl, syncAllAccountAvatars };
}

import type { GameId, RemoteProviderId } from '@/domain/game-bind-options';
import type { StoredProviderAccount } from '@/domain/session-vault';
import type { ProviderSession } from '@/providers/contracts';
import { isHttpCookieSession } from '@/providers/http-cookies';

export type StoredCredentialIndex = {
  id: string;
  providerId: RemoteProviderId;
  secretRef: string;
};

export type SessionIndex = {
  version: 4;
  activeAccountId: string | null;
  credentials: StoredCredentialIndex[];
  accounts: StoredProviderAccount[];
};

function isRemoteProviderId(value: unknown): value is RemoteProviderId {
  return value === 'rizline-official' || value === 'majdata-net' || value === 'diving-fish' || value === 'lxns' || value === 'phi-taptap' || value === 'osu';
}

function isGameId(value: unknown): value is GameId {
  return value === 'rizline' || value === 'majdata-net' || value === 'maimai'
    || value === 'chunithm'
    || value === 'phigros'
    || value === 'osu-standard'
    || value === 'osu-mania'
    || value === 'osu-catch'
    || value === 'osu-taiko';
}

const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
function validRizlineSession(session: Extract<ProviderSession, { mode: 'rizline'; }>): boolean {
  return nonempty(session.token) && typeof session.phone === 'string' && /^1\d{10}$/.test(session.phone)
    && nonempty(session.deviceId) && nonempty(session.channelId);
}
function isPersistableSession(session: ProviderSession): session is ProviderSession & { persistable: true; } {
  if (!session || typeof session !== 'object') return false;
  if (session.mode === 'http-cookies') return isHttpCookieSession(session);
  if (session.persistable !== true) return false;
  switch (session.mode) {
    case 'rizline': return validRizlineSession(session);
    case 'jwt': case 'import-token': return nonempty(session.value);
    case 'phi-session': return nonempty(session.sessionToken) && nonempty(session.playerId);
    case 'lxns-oauth': case 'osu-oauth':
      return nonempty(session.accessToken) && nonempty(session.refreshToken)
        && typeof session.expiresAt === 'number' && Number.isFinite(session.expiresAt);
    default: return false;
  }
}

export function sessionMatchesExpected(current: ProviderSession | undefined, expected?: ProviderSession): boolean {
  if (!expected) return true;
  if (expected.mode === 'rizline' || current?.mode === 'rizline') {
    return current?.mode === 'rizline' && expected.mode === 'rizline' && current.token === expected.token;
  }
  return JSON.stringify(current) === JSON.stringify(expected);
}

export function isOAuthRefreshSession(
  session: ProviderSession | undefined,
): session is ProviderSession & { mode: 'lxns-oauth' | 'osu-oauth'; refreshToken: string; } {
  return session?.mode === 'lxns-oauth' || session?.mode === 'osu-oauth';
}

export function credentialIdForAccount(accountId: string): string {
  return `credential:${accountId}`;
}

function parseAccountMetadata(
  value: unknown,
  credentialProviders: ReadonlyMap<string, RemoteProviderId>,
): StoredProviderAccount | null {
  if (!value || typeof value !== 'object') return null;
  const account = value as Partial<StoredProviderAccount>;
  if (typeof account.id !== 'string'
    || typeof account.displayName !== 'string'
    || typeof account.scoreDisplay !== 'string'
    || typeof account.credentialId !== 'string'
    || !isGameId(account.gameId)
    || !isRemoteProviderId(account.providerId)
    || credentialProviders.get(account.credentialId) !== account.providerId
    || (account.challengeModeRank !== undefined && account.challengeModeRank !== null && typeof account.challengeModeRank !== 'number')
    || (account.ratingPossession !== undefined && account.ratingPossession !== null && typeof account.ratingPossession !== 'string')) {
    return null;
  }
  return {
    id: account.id,
    gameId: account.gameId,
    providerId: account.providerId,
    credentialId: account.credentialId,
    displayName: account.displayName,
    scoreDisplay: account.scoreDisplay,
    challengeModeRank: account.challengeModeRank,
    ratingPossession: account.ratingPossession,
  };
}

export function parseSessionIndexOrThrow(raw: string): SessionIndex {
  const parsed = JSON.parse(raw) as Partial<SessionIndex>;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || parsed.version !== 4 || !Array.isArray(parsed.credentials) || !Array.isArray(parsed.accounts)
    || (parsed.activeAccountId !== null && typeof parsed.activeAccountId !== 'string')) {
    throw new TypeError('不支持的账号索引');
  }
  const credentials = parsed.credentials.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const credential = value as Partial<StoredCredentialIndex>;
    if (typeof credential.id !== 'string'
      || !isRemoteProviderId(credential.providerId)
      || typeof credential.secretRef !== 'string'
      || !credential.secretRef) {
      return [];
    }
    return [{
      id: credential.id,
      providerId: credential.providerId,
      secretRef: credential.secretRef,
    }];
  });
  if (credentials.length !== parsed.credentials.length || new Set(credentials.map(item => item.id)).size !== credentials.length) {
    throw new TypeError('不支持的账号索引');
  }
  const credentialProviders = new Map(
    credentials.map((credential) => [credential.id, credential.providerId] as const),
  );
  const accounts = parsed.accounts.flatMap((value) => {
    const account = parseAccountMetadata(value, credentialProviders);
    return account ? [account] : [];
  });
  if (accounts.length !== parsed.accounts.length || new Set(accounts.map(item => item.id)).size !== accounts.length) {
    throw new TypeError('不支持的账号索引');
  }
  return {
    version: 4,
    activeAccountId: parsed.activeAccountId,
    credentials,
    accounts,
  };
}

export function parseSessionIndex(raw: string): SessionIndex | null {
  try {
    return parseSessionIndexOrThrow(raw);
  } catch {
    return null;
  }
}

export function parseStoredSession(raw: string | null): ProviderSession | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as ProviderSession;
    return isPersistableSession(session) ? session : null;
  } catch {
    return null;
  }
}

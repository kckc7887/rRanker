import type { GameId, RemoteProviderId } from '@/domain/game-bind-options';
import type { SessionVault, StoredProviderAccount, StoredProviderCredential } from '@/domain/session-vault';
import { SessionPersistenceError } from '@/domain/session-vault';
import type { ProviderSession } from '@/providers/contracts';
import { isHttpCookieSession } from '@/providers/http-cookies';

/** 会话索引不是合法 JSON。原键保留，副本写在 corrupt 键上，调用方可重试读取。 */
export class SessionIndexCorruptError extends SessionPersistenceError {
  readonly name = 'SessionIndexCorruptError';

  constructor(readonly preservedRaw: string, options?: { cause?: unknown; }) {
    super('local_commit', options);
  }
}

/** 会话索引版本或顶层结构无法识别。原键保留，副本写在 unrecognized 键上，后续写入不得覆盖原键。 */
export class SessionIndexUnrecognizedError extends SessionPersistenceError {
  readonly name = 'SessionIndexUnrecognizedError';

  constructor(
    readonly preservedRaw: string,
    readonly reason: 'unsupported-version' | 'invalid-structure',
  ) {
    super('local_commit');
  }
}

type V2StoredProviderAccount = Omit<StoredProviderAccount, 'credentialId'> & {
  session: ProviderSession;
};

type V2SessionVault = {
  version: 2;
  activeAccountId: string | null;
  accounts: V2StoredProviderAccount[];
  recovery?: SessionVault['recovery'];
};

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
  recovery?: SessionVault['recovery'];
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
export function isPersistableSession(session: ProviderSession): session is ProviderSession & { persistable: true; } {
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

/** 可轮换的 OAuth 会话：落雪与 osu! 都按 refresh token 判定凭据世代。 */
export function isOAuthRefreshSession(
  session: ProviderSession | undefined,
): session is ProviderSession & { mode: 'lxns-oauth' | 'osu-oauth'; refreshToken: string; } {
  return session?.mode === 'lxns-oauth' || session?.mode === 'osu-oauth';
}

export function credentialIdForLegacyAccount(accountId: string): string {
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
    || credentialProviders.get(account.credentialId) !== account.providerId) {
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
    ratingPossession: typeof account.ratingPossession === 'string'
      || account.ratingPossession === null
      ? account.ratingPossession
      : undefined,
  };
}

function uniqueLegacyIdentities(rows: readonly unknown[]): unknown[] {
  const counts = new Map<unknown, number>();
  for (const row of rows) {
    if (row && typeof row === 'object' && 'id' in row) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  }
  return rows.filter(row => row && typeof row === 'object' && 'id' in row && nonempty(row.id) && counts.get(row.id) === 1);
}

export function parseSessionVault(raw: string): SessionVault | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SessionVault>;
    if (parsed.version !== 3
      || !Array.isArray(parsed.credentials)
      || !Array.isArray(parsed.accounts)) {
      return null;
    }
    const credentials = uniqueLegacyIdentities(parsed.credentials).flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const credential = value as Partial<StoredProviderCredential>;
      if (typeof credential.id !== 'string'
        || !isRemoteProviderId(credential.providerId)
        || !credential.session
        || !isPersistableSession(credential.session)) {
        return [];
      }
      return [{
        id: credential.id,
        providerId: credential.providerId,
        session: credential.session,
      }];
    });
    const credentialProviders = new Map(
      credentials.map((credential) => [credential.id, credential.providerId] as const),
    );
    const accounts = uniqueLegacyIdentities(parsed.accounts).flatMap((value) => {
      const account = parseAccountMetadata(value, credentialProviders);
      return account ? [account] : [];
    });
    return {
      version: 3,
      activeAccountId: typeof parsed.activeAccountId === 'string'
        ? parsed.activeAccountId
        : accounts[0]?.id ?? null,
      credentials,
      accounts,
      ...migrationRecovery(3, parsed.accounts.length - accounts.length, parsed.credentials.length - credentials.length),
    };
  } catch {
    return null;
  }
}

export function parseV2Vault(raw: string): V2SessionVault | null {
  try {
    const parsed = JSON.parse(raw) as Partial<V2SessionVault>;
    if (parsed.version !== 2 || !Array.isArray(parsed.accounts)) return null;
    const accounts = uniqueLegacyIdentities(parsed.accounts).flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const account = value as Partial<V2StoredProviderAccount>;
      if (typeof account.id !== 'string'
        || typeof account.displayName !== 'string'
        || typeof account.scoreDisplay !== 'string'
        || !isGameId(account.gameId)
        || !isRemoteProviderId(account.providerId)
        || !account.session
        || !isPersistableSession(account.session)) {
        return [];
      }
      return [{
        id: account.id,
        gameId: account.gameId,
        providerId: account.providerId,
        displayName: account.displayName,
        scoreDisplay: account.scoreDisplay,
        challengeModeRank: account.challengeModeRank,
        ratingPossession: account.ratingPossession,
        session: account.session,
      }];
    });
    return {
      version: 2,
      activeAccountId: typeof parsed.activeAccountId === 'string'
        ? parsed.activeAccountId
        : accounts[0]?.id ?? null,
      accounts,
      ...migrationRecovery(2, parsed.accounts.length - accounts.length, 0),
    };
  } catch {
    return null;
  }
}

export function migrateV2Vault(vault: V2SessionVault): SessionVault {
  return {
    version: 3,
    activeAccountId: vault.activeAccountId,
    ...(vault.recovery ? { recovery: vault.recovery } : {}),
    credentials: vault.accounts.map((account) => ({
      id: credentialIdForLegacyAccount(account.id),
      providerId: account.providerId,
      session: account.session,
    })),
    accounts: vault.accounts.map(({ session: _session, ...account }) => ({
      ...account,
      credentialId: credentialIdForLegacyAccount(account.id),
    })),
  };
}

export function sanitizeVault(vault: SessionVault): SessionVault {
  const credentials = vault.credentials.filter((credential) => (
    isRemoteProviderId(credential.providerId)
    && isPersistableSession(credential.session)
  ));
  const credentialProviders = new Map(
    credentials.map((credential) => [credential.id, credential.providerId] as const),
  );
  const accounts = vault.accounts.filter((account) => (
    credentialProviders.get(account.credentialId) === account.providerId
    && isRemoteProviderId(account.providerId)
    && isGameId(account.gameId)
  ));
  const usedCredentialIds = new Set(accounts.map((account) => account.credentialId));
  return {
    version: 3,
    activeAccountId: vault.activeAccountId,
    credentials: credentials.filter((credential) => usedCredentialIds.has(credential.id)),
    accounts,
    ...(vault.recovery ? { recovery: vault.recovery } : {}),
  };
}

function migrationRecovery(sourceVersion: 2 | 3, rejectedAccounts: number, rejectedCredentials: number): Pick<SessionVault, 'recovery'> {
  return rejectedAccounts || rejectedCredentials
    ? { recovery: { integrity: 'partial', sourceVersion, rejectedAccounts, rejectedCredentials } }
    : {};
}

function indexRecovery(recovery: SessionIndex['recovery'], raw: string): Pick<SessionIndex, 'recovery'> {
  if (recovery === undefined) return {};
  if (!recovery || recovery.integrity !== 'partial'
    || (recovery.sourceVersion !== 2 && recovery.sourceVersion !== 3)
    || !Number.isSafeInteger(recovery.rejectedAccounts) || recovery.rejectedAccounts < 0
    || !Number.isSafeInteger(recovery.rejectedCredentials) || recovery.rejectedCredentials < 0) {
    throw new SessionIndexUnrecognizedError(raw, 'invalid-structure');
  }
  return { recovery: { integrity: recovery.integrity, sourceVersion: recovery.sourceVersion,
    rejectedAccounts: recovery.rejectedAccounts, rejectedCredentials: recovery.rejectedCredentials } };
}

export function parseSessionIndexOrThrow(raw: string): SessionIndex {
  let parsed: Partial<SessionIndex>;
  try {
    parsed = JSON.parse(raw) as Partial<SessionIndex>;
  } catch (cause) {
    throw new SessionIndexCorruptError(raw, { cause });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SessionIndexUnrecognizedError(raw, 'invalid-structure');
  }
  if (typeof parsed.version === 'number' && parsed.version !== 4) {
    throw new SessionIndexUnrecognizedError(raw, 'unsupported-version');
  }
  if (parsed.version !== 4
    || !Array.isArray(parsed.credentials)
    || !Array.isArray(parsed.accounts)) {
    throw new SessionIndexUnrecognizedError(raw, 'invalid-structure');
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
    throw new SessionIndexUnrecognizedError(raw, 'invalid-structure');
  }
  const credentialProviders = new Map(
    credentials.map((credential) => [credential.id, credential.providerId] as const),
  );
  const accounts = parsed.accounts.flatMap((value) => {
    const account = parseAccountMetadata(value, credentialProviders);
    return account ? [account] : [];
  });
  if (accounts.length !== parsed.accounts.length || new Set(accounts.map(item => item.id)).size !== accounts.length) {
    throw new SessionIndexUnrecognizedError(raw, 'invalid-structure');
  }
  return {
    version: 4,
    activeAccountId: typeof parsed.activeAccountId === 'string'
      ? parsed.activeAccountId
      : accounts[0]?.id ?? null,
    credentials,
    accounts,
    ...indexRecovery(parsed.recovery, raw),
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

export function vaultFingerprint(vault: SessionVault): string {
  return JSON.stringify({
    activeAccountId: vault.activeAccountId,
    credentials: [...vault.credentials]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((credential) => [
        credential.id,
        credential.providerId,
        credential.session,
      ]),
    accounts: [...vault.accounts]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((account) => [
        account.id,
        account.gameId,
        account.providerId,
        account.credentialId,
        account.displayName,
        account.scoreDisplay,
        account.challengeModeRank ?? null,
        account.ratingPossession ?? null,
      ]),
  });
}

import { isCredential, type Credential } from '@rranker/sdk/credentials';
import { getDataSource } from '@rranker/sdk/registry';
import { isAccountDisplayData } from '@rranker/sdk/account';
import type { ProviderId } from '@rranker/sdk/domain/game-bind-options';
import type { StoredProviderAccount } from '@rranker/sdk/domain/session-vault';


export type StoredCredentialIndex = {
  id: string;
  providerId: ProviderId;
  secretRef: string;
};

export type SessionIndex = {
  version: 4;
  activeAccountId: string | null;
  credentials: StoredCredentialIndex[];
  accounts: StoredProviderAccount[];
};

const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

export function sessionMatchesExpected(providerId: ProviderId, current: Credential | undefined, expected?: Credential): boolean {
  if (!expected) return true;
  if (!current) return false;
  const matches = getDataSource(providerId)?.credentialMatches;
  return matches ? matches(current, expected) : JSON.stringify(current) === JSON.stringify(expected);
}

export function credentialIdForAccount(accountId: string): string {
  return `credential:${accountId}`;
}

function parseAccountMetadata(
  value: unknown,
  credentialProviders: ReadonlyMap<string, ProviderId>,
): StoredProviderAccount | null {
  if (!value || typeof value !== 'object') return null;
  const account = value as Partial<StoredProviderAccount>;
  if (typeof account.id !== 'string'
    || typeof account.displayName !== 'string'
    || typeof account.scoreDisplay !== 'string'
    || typeof account.credentialId !== 'string'
    || !nonempty(account.gameId)
    || !nonempty(account.providerId)
    || credentialProviders.get(account.credentialId) !== account.providerId
    || (account.displayData !== undefined && !isAccountDisplayData(account.displayData))) {
    return null;
  }
  return {
    id: account.id,
    gameId: account.gameId,
    providerId: account.providerId,
    credentialId: account.credentialId,
    displayName: account.displayName,
    scoreDisplay: account.scoreDisplay,
    displayData: account.displayData,
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
      || !nonempty(credential.providerId)
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

export function parseStoredSession(providerId: ProviderId, raw: string | null): Credential | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isCredential(value) || value.persistable !== true) return null;
  const source = getDataSource(providerId);
  return source ? source.parseCredential?.(value) ?? null : value;
}

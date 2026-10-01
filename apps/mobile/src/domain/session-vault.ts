import type { GameId, RemoteProviderId } from '@/domain/game-bind-options';
import type { ProviderSession } from '@/providers/contracts';

/** Identifies the local persistence boundary without exposing native exception text. */
export class SessionPersistenceError extends Error {
  readonly name: string = 'SessionPersistenceError';
  constructor(readonly code: 'credential_storage' | 'local_commit', options?: ErrorOptions) {
    super(code === 'credential_storage' ? '无法保存本机登录凭据' : '无法提交本机账号数据', options);
  }
}

export type StoredProviderCredential = { id: string; providerId: RemoteProviderId; session: ProviderSession };
export type StoredProviderAccount = {
  id: string;
  gameId: GameId;
  providerId: RemoteProviderId;
  credentialId: string;
  displayName: string;
  scoreDisplay: string;
  challengeModeRank?: number | null;
  ratingPossession?: string | null;
};
export type SessionVault = {
  version: 3;
  activeAccountId: string | null;
  credentials: StoredProviderCredential[];
  accounts: StoredProviderAccount[];
  recovery?: SessionMigrationRecovery;
};

/** 仅包含完整性摘要；隔离原文继续保存在安全存储中。 */
export type SessionMigrationRecovery = {
  integrity: 'partial';
  sourceVersion: 2 | 3;
  rejectedAccounts: number;
  rejectedCredentials: number;
};

export function sessionsMapFromVault(vault: SessionVault): Record<string, ProviderSession> {
  const credentials = new Map(vault.credentials.map((credential) => [credential.id, credential.session] as const));
  const sessions: Record<string, ProviderSession> = {};
  for (const account of vault.accounts) {
    const session = credentials.get(account.credentialId);
    if (session) sessions[account.id] = session;
  }
  return sessions;
}
export function credentialIdsMapFromVault(vault: SessionVault): Record<string, string> {
  return Object.fromEntries(vault.accounts.map((account) => [account.id, account.credentialId]));
}

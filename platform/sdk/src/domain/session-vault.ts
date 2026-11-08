import type { Credential } from '@rranker/sdk/credentials';
import type { GameId, ProviderId } from '@rranker/sdk/domain/game-bind-options';
import type { AccountDisplayData } from '@rranker/sdk/account';


export class SessionPersistenceError extends Error {
  readonly name: string = 'SessionPersistenceError';
  constructor(readonly code: 'credential_storage' | 'local_commit', options?: ErrorOptions) {
    super(code === 'credential_storage' ? '无法保存本机登录凭据' : '无法提交本机账号数据', options);
  }
}

export type StoredProviderCredential = { id: string; providerId: ProviderId; session: Credential };
export type StoredProviderAccount = {
  id: string;
  gameId: GameId;
  providerId: ProviderId;
  credentialId: string;
  displayName: string;
  scoreDisplay: string;
  displayData?: AccountDisplayData;
};
export type SessionVault = {
  version: 3;
  activeAccountId: string | null;
  credentials: StoredProviderCredential[];
  accounts: StoredProviderAccount[];
};

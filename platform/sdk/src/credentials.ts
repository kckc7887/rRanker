import type { BoundAccount } from './account';

export type Credential = { mode: string; persistable: boolean; [key: string]: unknown };
export type CredentialCommitResult = 'applied' | 'pending-persist' | 'stale' | 'removed';
export type SourceClientContext = {
  account: BoundAccount;
  readonly credential: Credential | null;
  assertCurrent: () => void;
  commitCredential: (next: Credential, expected: Credential) => Promise<CredentialCommitResult>;
};

export type OAuthCredential<M extends string> = {
  mode: M; accessToken: string; refreshToken: string; expiresAt: number; persistable: true;
};

export function isCredential(value: unknown): value is Credential {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const credential = value as Credential;
  return typeof credential.mode === 'string' && credential.mode.length > 0 && typeof credential.persistable === 'boolean';
}

export function parseOAuthCredential<M extends string>(value: unknown, mode: M): OAuthCredential<M> | null {
  if (!isCredential(value) || value.mode !== mode || value.persistable !== true
    || typeof value.accessToken !== 'string' || !value.accessToken
    || typeof value.refreshToken !== 'string' || !value.refreshToken
    || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)) return null;
  return value as OAuthCredential<M>;
}

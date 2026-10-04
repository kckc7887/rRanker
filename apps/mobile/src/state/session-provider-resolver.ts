import type { BoundAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { createSessionProviders, type SessionProviders } from '@/services/session-providers';

type CachedProviders = {
  gameId: BoundAccount['gameId'];
  providerId: BoundAccount['providerId'];
  displayName: string;
  credentialId: string | null;
  session: ProviderSession | null;
  providers: SessionProviders;
};

const providersByAccount = new Map<string, CachedProviders>();

export function resolveSessionProviders(account: BoundAccount, credentialId: string | null, session: ProviderSession | null): SessionProviders {
  const cached = providersByAccount.get(account.id);
  if (cached && cached.gameId === account.gameId && cached.providerId === account.providerId
    && cached.displayName === account.displayName && cached.credentialId === credentialId && cached.session === session) return cached.providers;
  const providers = createSessionProviders(account, session);
  providersByAccount.set(account.id, { gameId: account.gameId, providerId: account.providerId,
    displayName: account.displayName, credentialId, session, providers });
  return providers;
}

export function releaseResolvedProviders(accountIds: readonly string[]): void {
  for (const accountId of accountIds) providersByAccount.delete(accountId);
}

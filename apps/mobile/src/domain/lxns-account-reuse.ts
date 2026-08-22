import type { BoundAccount } from './bound-account';
import type { GameId } from './game-bind-options';
import type { ProviderSession } from '@/providers/contracts';
import { reusableSharedCredentialAccounts } from './shared-credential-account-reuse';

/** 为舞萌和中二节奏复用落雪账号凭据。 */
export function reusableLxnsAccounts(input: {
  targetGameId: Extract<GameId, 'maimai' | 'chunithm'>;
  accounts: readonly BoundAccount[];
  sessionsByAccountId: Readonly<Record<string, ProviderSession | undefined>>;
  credentialIdsByAccountId: Readonly<Record<string, string | undefined>>;
}): BoundAccount[] {
  return reusableSharedCredentialAccounts({
    providerId: 'lxns',
    sessionMode: 'lxns-oauth',
    targetGameId: input.targetGameId,
    siblingGameIds: input.targetGameId === 'maimai' ? ['chunithm'] : ['maimai'],
    accounts: input.accounts,
    sessionsByAccountId: input.sessionsByAccountId,
    credentialIdsByAccountId: input.credentialIdsByAccountId,
  });
}

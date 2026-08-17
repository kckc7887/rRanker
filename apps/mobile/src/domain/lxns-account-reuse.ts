import type { BoundAccount } from './bound-account';
import type { GameId } from './game-bind-options';
import type { ProviderSession } from '@/providers/contracts';
import { reusableSharedCredentialAccounts } from './shared-credential-account-reuse';

/** 落雪账号复用（舞萌/中二互绑）：共享凭据复用公共逻辑的薄包装，行为与原实现一致。 */
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

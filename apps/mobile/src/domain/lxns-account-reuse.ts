import type { BoundAccount } from './bound-account';
import type { GameId } from './game-bind-options';
import type { ProviderSession } from '@/providers/contracts';

export function reusableLxnsAccounts(input: {
  targetGameId: Extract<GameId, 'maimai' | 'chunithm'>;
  accounts: readonly BoundAccount[];
  sessionsByAccountId: Readonly<Record<string, ProviderSession | undefined>>;
  credentialIdsByAccountId: Readonly<Record<string, string | undefined>>;
}): BoundAccount[] {
  const targetCredentialIds = new Set(
    input.accounts
      .filter((account) => (
        account.gameId === input.targetGameId
        && account.providerId === 'lxns'
      ))
      .map((account) => input.credentialIdsByAccountId[account.id])
      .filter((value): value is string => typeof value === 'string'),
  );
  const seen = new Set<string>();
  return input.accounts.filter((account) => {
    if (account.providerId !== 'lxns' || account.gameId === input.targetGameId) return false;
    const credentialId = input.credentialIdsByAccountId[account.id];
    const session = input.sessionsByAccountId[account.id];
    if (!credentialId
      || targetCredentialIds.has(credentialId)
      || seen.has(credentialId)
      || session?.mode !== 'lxns-oauth') {
      return false;
    }
    seen.add(credentialId);
    return true;
  });
}

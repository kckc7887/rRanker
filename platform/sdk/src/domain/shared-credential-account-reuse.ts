import type { Credential } from '@rranker/sdk/credentials';
import type { BoundAccount } from '@rranker/sdk/account';
import type { GameId, ProviderId } from '@rranker/sdk/domain/game-bind-options';
import { boundModesOfCredential } from '@rranker/sdk/domain/game-mode-family';


/** 落雪双游戏与 osu! 四模式可复用同一凭据。 */
export function reusableSharedCredentialAccounts(input: {
  providerId: ProviderId;
  sessionMode: Credential['mode'];
  targetGameId: GameId;
  siblingGameIds: readonly GameId[];
  accounts: readonly BoundAccount[];
  sessionsByAccountId: Readonly<Record<string, Credential | undefined>>;
  credentialIdsByAccountId: Readonly<Record<string, string | undefined>>;
}): BoundAccount[] {
  const targetCredentialIds = new Set(
    input.accounts
      .filter((account) => (
        account.gameId === input.targetGameId
        && account.providerId === input.providerId
      ))
      .map((account) => input.credentialIdsByAccountId[account.id])
      .filter((value): value is string => typeof value === 'string'),
  );
  const siblingSet = new Set(input.siblingGameIds);
  const seen = new Set<string>();
  return input.accounts.filter((account) => {
    if (account.providerId !== input.providerId
      || account.gameId === input.targetGameId
      || !siblingSet.has(account.gameId)) {
      return false;
    }
    const credentialId = input.credentialIdsByAccountId[account.id];
    const session = input.sessionsByAccountId[account.id];
    if (!credentialId
      || targetCredentialIds.has(credentialId)
      || seen.has(credentialId)
      || session?.mode !== input.sessionMode) {
      return false;
    }
    seen.add(credentialId);
    return true;
  });
}

export function reusablePartiallyBoundAccounts(input: {
  providerId: ProviderId;
  sessionMode: Credential['mode'];
  familyModeGameIds: readonly GameId[];
  accounts: readonly BoundAccount[];
  sessionsByAccountId: Readonly<Record<string, Credential | undefined>>;
  credentialIdsByAccountId: Readonly<Record<string, string | undefined>>;
}): BoundAccount[] {
  const seen = new Set<string>();
  const result: BoundAccount[] = [];
  for (const account of input.accounts) {
    if (account.providerId !== input.providerId) continue;
    const credentialId = input.credentialIdsByAccountId[account.id];
    if (!credentialId || seen.has(credentialId)) continue;
    if (input.sessionsByAccountId[account.id]?.mode !== input.sessionMode) continue;
    seen.add(credentialId);
    const boundModes = boundModesOfCredential(
      input.accounts,
      input.credentialIdsByAccountId,
      credentialId,
    );
    if (boundModes.size >= input.familyModeGameIds.length) continue;
    result.push(account);
  }
  return result;
}

import type { BoundAccount } from './bound-account';
import type { GameId, ProviderId } from './game-bind-options';
import { boundModesOfCredential } from './game-mode-family';
import type { ProviderSession } from '@/providers/contracts';

/**
 * 通用共享凭据账号复用：同一 OAuth 账号已绑定到兄弟游戏时，允许目标游戏
 * 直接复用该账号的凭据完成绑定（落雪舞萌/中二、osu! 四模式同族共用此语义）。
 * 返回去重后的可复用账号列表；凭据已绑定目标游戏、凭据缺失或会话类型不符的账号被排除。
 */
export function reusableSharedCredentialAccounts(input: {
  providerId: ProviderId;
  sessionMode: ProviderSession['mode'];
  targetGameId: GameId;
  siblingGameIds: readonly GameId[];
  accounts: readonly BoundAccount[];
  sessionsByAccountId: Readonly<Record<string, ProviderSession | undefined>>;
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

/**
 * 家族账号复用列表：多模式游戏家族中「尚未绑定全部模式」的账号（按凭据去重），
 * 供绑定页展示「使用已有账号」并进入该账号的模式选择补充绑定。
 */
export function reusablePartiallyBoundAccounts(input: {
  providerId: ProviderId;
  sessionMode: ProviderSession['mode'];
  familyModeGameIds: readonly GameId[];
  accounts: readonly BoundAccount[];
  sessionsByAccountId: Readonly<Record<string, ProviderSession | undefined>>;
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

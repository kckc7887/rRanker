import * as Crypto from 'expo-crypto';
import {
  createOsuBoundAccount,
  osuUserIdFromAccountId,
  type BoundAccount,
} from '@/domain/bound-account';
import {
  isOsuGameId,
  OSU_FAMILY,
  type OsuGameId,
} from '@/domain/game-mode-family';
import type { ProviderSession } from '@/providers/contracts';
import { ProviderError, runProviderOperation } from '@/providers/errors';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import type { OsuOAuthSession } from '@/providers/osu-oauth';
import { SecureSessionStore } from '@/storage/secure-session-store';

const sessions = new SecureSessionStore();

export type OsuBindingResult = {
  accounts: BoundAccount[];
  credentialId: string;
  session: OsuOAuthSession;
  activeAccountId: string;
};

async function createCredentialId(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return `osu:${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function requireOsuSession(session: ProviderSession): OsuOAuthSession {
  if (session.mode !== 'osu-oauth') {
    throw new TypeError('复用 osu! 账号需要 OAuth 会话');
  }
  return session;
}

export async function bindOsuModes(input: {
  modeGameIds: readonly OsuGameId[];
  session: ProviderSession;
  credentialId?: string;
  existingAccounts: readonly BoundAccount[];
  credentialIdsByAccountId: Readonly<Record<string, string | undefined>>;
  signal?: AbortSignal;
  assertCurrent?: () => void;
}): Promise<OsuBindingResult> {
  const assertCurrent = () => {
    if (input.signal?.aborted) throw input.signal.reason;
    input.assertCurrent?.();
  };
  assertCurrent();
  const initialSession = requireOsuSession(input.session);
  const modes = [...new Set(input.modeGameIds)]
    .filter((gameId): gameId is OsuGameId => (
      isOsuGameId(gameId) && OSU_FAMILY.modeGameIds.includes(gameId)
    ));
  if (modes.length === 0) {
    throw new ProviderError('authentication', '请至少选择一个 osu! 模式', false);
  }

  const provider = new OsuScoreProvider(initialSession);
  const own = await provider.getOwnUser(modes[0], input.signal);
  assertCurrent();
  const userId = own.id;

  let credentialId = input.credentialId;
  if (!credentialId) {
    const existing = input.existingAccounts.find((account) => (
      account.providerId === 'osu' && osuUserIdFromAccountId(account.id) === userId
    ));
    credentialId = existing
      ? input.credentialIdsByAccountId[existing.id]
      : undefined;
  }
  credentialId ??= await runProviderOperation('authorization_prepare', createCredentialId);
  assertCurrent();

  const accounts: BoundAccount[] = [];
  for (const gameId of modes) {
    assertCurrent();
    const user = await provider.getUser(userId, gameId, input.signal);
    assertCurrent();
    const account = createOsuBoundAccount({
      gameId,
      userId,
      displayName: user.username,
      pp: typeof user.statistics.pp === 'number' && Number.isFinite(user.statistics.pp)
        ? user.statistics.pp
        : null,
      avatarUrl: user.avatar_url ?? null,
    });
    accounts.push(account);
  }

  const finalSession = provider.getSession();
  const activeAccountId = accounts[0].id;
  await sessions.upsertAccounts(accounts.map(account => ({
    id: account.id,
    gameId: account.gameId,
    providerId: 'osu' as const,
    credentialId,
    displayName: account.displayName,
    scoreDisplay: account.scoreDisplay,
    session: finalSession,
  })), { activeAccountId, signal: input.signal, assertCurrent: input.assertCurrent });
  assertCurrent();

  return {
    accounts,
    credentialId,
    session: finalSession,
    activeAccountId,
  };
}

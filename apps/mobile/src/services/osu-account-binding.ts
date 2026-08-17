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
import { ProviderError } from '@/providers/errors';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import type { OsuOAuthSession } from '@/providers/osu-oauth';
import { SecureSessionStore } from '@/storage/secure-session-store';

const sessions = new SecureSessionStore();

export type OsuBindingResult = {
  /** 本次新建/更新的模式账号。 */
  accounts: BoundAccount[];
  credentialId: string;
  session: OsuOAuthSession;
  /** 建议激活的账号 id（首个选中模式）。 */
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

/**
 * 绑定 osu! 模式：同一 osu 用户共享一个凭据（credentialId），按选中模式各建一个账号。
 * - 已存在同用户（playerId 相同）的账号时复用其 credentialId（重复 OAuth 登录合并）；
 * - 空选择报错；重复模式按去重处理；仅创建选中模式。
 */
export async function bindOsuModes(input: {
  modeGameIds: readonly OsuGameId[];
  session: ProviderSession;
  credentialId?: string;
  existingAccounts: readonly BoundAccount[];
  credentialIdsByAccountId: Readonly<Record<string, string | undefined>>;
}): Promise<OsuBindingResult> {
  const initialSession = requireOsuSession(input.session);
  const modes = [...new Set(input.modeGameIds)]
    .filter((gameId): gameId is OsuGameId => (
      isOsuGameId(gameId) && OSU_FAMILY.modeGameIds.includes(gameId)
    ));
  if (modes.length === 0) {
    throw new ProviderError('authentication', '请至少选择一个 osu! 模式', false);
  }

  const provider = new OsuScoreProvider(initialSession);
  const own = await provider.getOwnUser(modes[0]);
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
  credentialId ??= await createCredentialId();

  const finalSession = provider.getSession();
  const accounts: BoundAccount[] = [];
  for (const gameId of modes) {
    const user = await provider.getUser(userId, gameId);
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
    await sessions.upsertAccount({
      id: account.id,
      gameId,
      providerId: 'osu',
      credentialId,
      displayName: account.displayName,
      scoreDisplay: account.scoreDisplay,
      session: finalSession,
    });
  }

  return {
    accounts,
    credentialId,
    session: finalSession,
    activeAccountId: accounts[0]?.id ?? '',
  };
}

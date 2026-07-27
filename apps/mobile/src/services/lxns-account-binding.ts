import * as Crypto from 'expo-crypto';
import {
  buildChunithmMapIconUrl,
  CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
  chunithmPersonalResourceKey,
  type ChunithmPersonalSnapshot,
} from '@/domain/chunithm-personal';
import {
  createChunithmBoundAccount,
  createMaimaiBoundAccount,
  type BoundAccount,
} from '@/domain/bound-account';
import type { GameId } from '@/domain/game-bind-options';
import type { ProviderSession } from '@/providers/contracts';
import { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import type { LxnsOAuthSession } from '@/providers/lxns-oauth';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const sessions = new SecureSessionStore();
const snapshots = new SqliteSnapshotRepository();

export type LxnsBindingResult = {
  account: BoundAccount;
  credentialId: string;
  session: LxnsOAuthSession;
  chunithmSnapshot?: ChunithmPersonalSnapshot;
};

async function createCredentialId(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return `lxns:${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function requireLxnsSession(session: ProviderSession): LxnsOAuthSession {
  if (session.mode !== 'lxns-oauth') {
    throw new TypeError('复用落雪账号需要 OAuth 会话');
  }
  return session;
}

export async function bindLxnsAccount(input: {
  gameId: Extract<GameId, 'maimai' | 'chunithm'>;
  session: ProviderSession;
  credentialId?: string;
}): Promise<LxnsBindingResult> {
  const initialSession = requireLxnsSession(input.session);
  const credentialId = input.credentialId ?? await createCredentialId();

  if (input.gameId === 'maimai') {
    const provider = new LxnsScoreProvider(initialSession);
    const [player] = await Promise.all([
      provider.getOptionalPlayer(),
      provider.getOptionalRecords(),
    ]);
    const created = createMaimaiBoundAccount({
      accountId: player ? undefined : `maimai:lxns:${credentialId}`,
      providerId: 'lxns',
      displayName: player?.displayName ?? '落雪账号（待同步）',
      rating: player?.rating ?? 0,
      playerId: player?.id ?? credentialId,
    });
    const account = player ? created : { ...created, scoreDisplay: '—' };
    const finalSession = provider.getSession();
    await sessions.upsertAccount({
      id: account.id,
      gameId: 'maimai',
      providerId: 'lxns',
      credentialId,
      displayName: account.displayName,
      scoreDisplay: account.scoreDisplay,
      session: finalSession,
    });
    return { account, credentialId, session: finalSession };
  }

  const provider = new ChunithmScoreProvider(initialSession);
  const snapshot = await provider.getSnapshot();
  const player = snapshot.player;
  const account = createChunithmBoundAccount({
    accountId: player ? undefined : `chunithm:lxns:${credentialId}`,
    displayName: player?.name ?? '落雪账号（待同步）',
    rating: player?.rating ?? null,
    playerId: player ? String(player.friend_code) : credentialId,
    avatarUrl: buildChunithmMapIconUrl(player?.map_icon?.id),
  });
  const finalSession = provider.getSession();
  await snapshots.saveResource(
    chunithmPersonalResourceKey(account.id),
    CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
    snapshot.source.updatedAt,
    snapshot,
  );
  await sessions.upsertAccount({
    id: account.id,
    gameId: 'chunithm',
    providerId: 'lxns',
    credentialId,
    displayName: account.displayName,
    scoreDisplay: account.scoreDisplay,
    session: finalSession,
  });
  return {
    account,
    credentialId,
    session: finalSession,
    chunithmSnapshot: snapshot,
  };
}

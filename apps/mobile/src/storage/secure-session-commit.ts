import type { SessionVault } from '@/domain/session-vault';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import type { LargeSecureValueStore } from '@/storage/large-secure-value-store';
import { parseSessionIndexOrThrow, parseStoredSession, type SessionIndex, type StoredCredentialIndex } from '@/storage/secure-session-codec';
import { INDEX_KEY, type KeyValueStore } from '@/storage/secure-session-index';

type SessionCommitIo = {
  index: KeyValueStore;
  credentials: Pick<LargeSecureValueStore, 'read' | 'write' | 'delete' | 'createReference'>;
};

export async function commitSessionVault(io: SessionCommitIo, vault: SessionVault, signal?: AbortSignal, assertCurrent?: () => void): Promise<readonly string[]> {
  const assertCommitCurrent = () => {
    if (signal?.aborted) throw signal.reason;
    assertCurrent?.();
  };
  assertCommitCurrent();
  const referenced = new Set(vault.accounts.map(account => account.credentialId));
  const currentRaw = await io.index.getItem(INDEX_KEY);
  const current = currentRaw === null ? null : parseSessionIndexOrThrow(currentRaw);
  assertCommitCurrent();
  const nextCredentials: StoredCredentialIndex[] = [];
  const newSecretRefs: string[] = [];
  let indexWriteStarted = false;
  let phase = 'credential-write';

  try {
    for (const credential of vault.credentials) {
      if (!referenced.has(credential.id)) continue;
      assertCommitCurrent();
      const previous = current?.credentials.find((item) => (
        item.id === credential.id && item.providerId === credential.providerId
      ));
      const previousSession = previous
        ? parseStoredSession(await io.credentials.read(previous.secretRef))
        : null;
      assertCommitCurrent();
      if (previous
        && previousSession
        && JSON.stringify(previousSession) === JSON.stringify(credential.session)) {
        nextCredentials.push(previous);
        continue;
      }
      const secretRef = io.credentials.createReference('provider-session');
      newSecretRefs.push(secretRef);
      const serialized = JSON.stringify(credential.session);
      await io.credentials.write(secretRef, serialized);
      assertCommitCurrent();
      nextCredentials.push({
        id: credential.id,
        providerId: credential.providerId,
        secretRef,
      });
    }

    const index: SessionIndex = {
      version: 4,
      activeAccountId: vault.activeAccountId,
      credentials: nextCredentials,
      accounts: vault.accounts,
    };
    assertCommitCurrent();
    indexWriteStarted = true;
    phase = 'index-commit';
    await io.index.setItem(INDEX_KEY, JSON.stringify(index));
    try {
      assertCommitCurrent();
    } catch (error) {
      phase = 'index-rollback';
      if (currentRaw === null) await io.index.removeItem(INDEX_KEY);
      else await io.index.setItem(INDEX_KEY, currentRaw);
      throw error;
    }
  } catch (error) {
    await discardUncommittedCredentials(io, newSecretRefs, indexWriteStarted);
    recordRuntimeError('session-persistence', error, false, { phase });
    throw error;
  }

  const retained = new Set(nextCredentials.map((item) => item.secretRef));
  return cleanupCredentialReferences(io, (current?.credentials ?? []).filter(item => !retained.has(item.secretRef)).map(item => item.secretRef), 'credential-cleanup');
}

async function discardUncommittedCredentials(io: SessionCommitIo, references: readonly string[], readBackIndex: boolean): Promise<void> {
  let referenced = new Set<string>();
  if (readBackIndex) {
    try {
      const actualRaw = await io.index.getItem(INDEX_KEY);
      const actual = actualRaw === null ? null : parseSessionIndexOrThrow(actualRaw);
      referenced = new Set(actual?.credentials.map(item => item.secretRef));
    } catch (readbackError) {
      recordRuntimeError('session-persistence', readbackError, false, { phase: 'rollback-readback' });
      return;
    }
  }
  await cleanupCredentialReferences(io, references.filter(reference => !referenced.has(reference)), 'rollback-cleanup');
}

async function cleanupCredentialReferences(io: SessionCommitIo, references: readonly string[], phase: string): Promise<readonly string[]> {
  const cleanupFailures: string[] = [];
  for (const reference of references) {
    try { await io.credentials.delete(reference); } catch (error) {
      cleanupFailures.push('登录凭据');
      recordRuntimeError('session-persistence', error, false, { phase });
    }
  }
  return [...new Set(cleanupFailures)];
}

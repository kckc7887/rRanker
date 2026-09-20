import { LargeSecureValueStore } from '@/storage/large-secure-value-store';

const store = new LargeSecureValueStore();

export function rizlinePasswordReference(accountId: string): string {
  return `rranker.secure.rizline-password.${accountId.replace(/[^a-z0-9._-]/giu, '-')}`;
}

export async function hasRizlinePassword(accountId: string): Promise<boolean> {
  return store.has(rizlinePasswordReference(accountId));
}

export async function readRizlinePassword(accountId: string): Promise<string | null> {
  return store.read(rizlinePasswordReference(accountId));
}

export async function writeRizlinePassword(accountId: string, password: string): Promise<void> {
  await store.write(rizlinePasswordReference(accountId), password);
}

export async function deleteRizlinePassword(accountId: string): Promise<void> {
  await store.delete(rizlinePasswordReference(accountId));
}

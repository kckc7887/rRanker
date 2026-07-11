import * as SecureStore from 'expo-secure-store';
import type { ProviderSession } from '@/providers/contracts';

const SESSION_KEY = 'rranker.diving-fish.session.v1';
export class SecureSessionStore {
  async save(session: ProviderSession): Promise<void> {
    if (!session.persistable) return;
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  async load(): Promise<ProviderSession | null> {
    const value = await SecureStore.getItemAsync(SESSION_KEY);
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as ProviderSession;
      if (parsed.mode !== 'jwt' && parsed.mode !== 'import-token') return null;
      return parsed;
    } catch { await this.clear(); return null; }
  }
  async clear(): Promise<void> { await SecureStore.deleteItemAsync(SESSION_KEY); }
}

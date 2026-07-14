import * as SecureStore from 'expo-secure-store';

const PREFS_KEY = 'rranker.upload.prefs.v1';

export type UploadPrefs = {
  friendCode: string;
  selectedAccountIds: string[];
};

const EMPTY: UploadPrefs = { friendCode: '', selectedAccountIds: [] };

export class UploadPrefsStore {
  async load(): Promise<UploadPrefs> {
    const raw = await SecureStore.getItemAsync(PREFS_KEY);
    if (!raw) return { ...EMPTY };
    try {
      const parsed = JSON.parse(raw) as Partial<UploadPrefs>;
      return {
        friendCode: typeof parsed.friendCode === 'string' ? parsed.friendCode : '',
        selectedAccountIds: Array.isArray(parsed.selectedAccountIds)
          ? parsed.selectedAccountIds.filter((id): id is string => typeof id === 'string')
          : [],
      };
    } catch {
      await this.clear();
      return { ...EMPTY };
    }
  }

  async save(prefs: UploadPrefs): Promise<void> {
    await SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(prefs), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(PREFS_KEY);
  }
}

export const uploadPrefsStore = new UploadPrefsStore();

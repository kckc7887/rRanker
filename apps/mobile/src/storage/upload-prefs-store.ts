import Storage, { enqueueKeyMutation } from '@/storage/key-value-storage';
import { z } from 'zod';

const PREFS_KEY = 'rranker.upload.prefs.v3';
const prefsSchema = z.object({
  friendCode: z.string(),
  selectionsByFriendCode: z.record(z.string(), z.array(z.string().min(1))),
});

export type UploadPrefs = {
  friendCode: string;
  selectedAccountIds: string[];
  selectionsByFriendCode: Record<string, string[]>;
};

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

function viewFor(friendCode: string, map: Record<string, string[]>): UploadPrefs {
  const code = friendCode.trim();
  return {
    friendCode: code,
    selectedAccountIds: code && map[code] ? [...map[code]!] : [],
    selectionsByFriendCode: { ...map },
  };
}

export class UploadPrefsStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  private async read(): Promise<UploadPrefs> {
    const raw = await this.storage.getItem(PREFS_KEY);
    if (raw === null) return viewFor('', {});
    let parsed: ReturnType<typeof prefsSchema.parse>;
    try {
      parsed = prefsSchema.parse(JSON.parse(raw));
    } catch {
      const defaults = viewFor('', {});
      await this.write(defaults);
      return defaults;
    }
    return viewFor(parsed.friendCode, parsed.selectionsByFriendCode);
  }

  private async write(prefs: UploadPrefs): Promise<void> {
    const friendCode = prefs.friendCode.trim();
    const map = prefs.selectionsByFriendCode;
    const payload = {
      friendCode,
      selectionsByFriendCode: map,
    };
    await this.storage.setItem(PREFS_KEY, JSON.stringify(payload));
  }

  async load(): Promise<UploadPrefs> {
    return enqueueKeyMutation(this.storage, PREFS_KEY, () => this.read());
  }

  async getSelectionFor(friendCode: string): Promise<string[]> {
    const prefs = await this.load();
    const code = friendCode.trim();
    return code && prefs.selectionsByFriendCode[code]
      ? [...prefs.selectionsByFriendCode[code]!]
      : [];
  }

  async save(prefs: {
    friendCode: string;
    selectedAccountIds?: string[];
    writeSelection?: boolean;
  }): Promise<void> {
    return enqueueKeyMutation(this.storage, PREFS_KEY, async () => {
      const current = await this.read();
      const friendCode = prefs.friendCode.trim();
      const map = { ...current.selectionsByFriendCode };
      const writeSelection = prefs.writeSelection !== false;
      if (writeSelection && friendCode && prefs.selectedAccountIds !== undefined) {
        const ids = prefs.selectedAccountIds;
        if (ids.length > 0) map[friendCode] = ids;
        else delete map[friendCode];
      }
      await this.write(viewFor(friendCode, map));
    });
  }

  async removeSelection(friendCode: string): Promise<void> {
    const code = friendCode.trim();
    if (!code) return;
    return enqueueKeyMutation(this.storage, PREFS_KEY, async () => {
      const current = await this.read();
      const map = { ...current.selectionsByFriendCode };
      delete map[code];
      const nextActive = current.friendCode === code
        ? (Object.keys(map)[0] ?? '')
        : current.friendCode;
      await this.write(viewFor(nextActive, map));
    });
  }

  async clear(): Promise<void> {
    return enqueueKeyMutation(this.storage, PREFS_KEY, async () => {
      await this.storage.removeItem(PREFS_KEY);
    });
  }
}

export const uploadPrefsStore = new UploadPrefsStore();

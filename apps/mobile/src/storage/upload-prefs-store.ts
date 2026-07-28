import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';

const PREFS_KEY_V1 = 'rranker.upload.prefs.v1';
const PREFS_KEY_V2 = 'rranker.upload.prefs.v2';
const PREFS_KEY_V3 = 'rranker.upload.prefs.v3';
const LEGACY_PREFS_KEYS = [PREFS_KEY_V2, PREFS_KEY_V1] as const;

export type UploadPrefs = {
  friendCode: string;
  /** 当前好友码对应的勾选（兼容旧调用）。 */
  selectedAccountIds: string[];
  /** 各好友码各自的「上传到」勾选。 */
  selectionsByFriendCode: Record<string, string[]>;
};

const EMPTY: UploadPrefs = {
  friendCode: '',
  selectedAccountIds: [],
  selectionsByFriendCode: {},
};

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

function sanitizeIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
}

function sanitizeMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object') return {};
  const next: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(value as Record<string, unknown>)) {
    const code = key.trim();
    if (!code) continue;
    const cleaned = sanitizeIds(ids);
    if (cleaned.length > 0) next[code] = cleaned;
  }
  return next;
}

function viewFor(friendCode: string, map: Record<string, string[]>): UploadPrefs {
  const code = friendCode.trim();
  return {
    friendCode: code,
    selectedAccountIds: code && map[code] ? [...map[code]!] : [],
    selectionsByFriendCode: { ...map },
  };
}

function parseV2(raw: string): UploadPrefs | null {
  try {
    const parsed = JSON.parse(raw) as Partial<UploadPrefs> & {
      activeFriendCode?: string;
    };
    const map = sanitizeMap(parsed.selectionsByFriendCode);
    const friendCode = typeof parsed.friendCode === 'string'
      ? parsed.friendCode.trim()
      : (typeof parsed.activeFriendCode === 'string' ? parsed.activeFriendCode.trim() : '');
    // 兼容仅有扁平 selectedAccountIds 的半迁移数据
    if (friendCode && !map[friendCode]) {
      const flat = sanitizeIds(parsed.selectedAccountIds);
      if (flat.length > 0) map[friendCode] = flat;
    }
    return viewFor(friendCode, map);
  } catch {
    return null;
  }
}

function parseV1(raw: string): UploadPrefs | null {
  try {
    const parsed = JSON.parse(raw) as Partial<UploadPrefs>;
    const friendCode = typeof parsed.friendCode === 'string' ? parsed.friendCode.trim() : '';
    const selectedAccountIds = sanitizeIds(parsed.selectedAccountIds);
    const map: Record<string, string[]> = {};
    if (friendCode && selectedAccountIds.length > 0) {
      map[friendCode] = selectedAccountIds;
    }
    return viewFor(friendCode, map);
  } catch {
    return null;
  }
}

async function deleteLegacyPrefsKeys(): Promise<void> {
  for (const key of LEGACY_PREFS_KEYS) {
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
  }
}

export class UploadPrefsStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}

  private async read(): Promise<UploadPrefs> {
    const rawV3 = await this.storage.getItem(PREFS_KEY_V3);
    if (rawV3) {
      const parsed = parseV2(rawV3);
      if (parsed) return parsed;
      await this.storage.removeItem(PREFS_KEY_V3);
    }

    const rawV2 = await SecureStore.getItemAsync(PREFS_KEY_V2);
    if (rawV2) {
      const parsed = parseV2(rawV2);
      if (parsed) {
        try {
          await this.write(parsed);
          const verifiedRaw = await this.storage.getItem(PREFS_KEY_V3);
          const verified = verifiedRaw ? parseV2(verifiedRaw) : null;
          if (verified && JSON.stringify(verified) === JSON.stringify(parsed)) {
            await deleteLegacyPrefsKeys();
            return verified;
          }
        } catch {
          // 保留旧 SecureStore 数据，供下次启动重试迁移。
        }
        return parsed;
      }
      await SecureStore.deleteItemAsync(PREFS_KEY_V2);
    }

    const rawV1 = await SecureStore.getItemAsync(PREFS_KEY_V1);
    if (rawV1) {
      const migrated = parseV1(rawV1);
      if (migrated) {
        try {
          await this.write(migrated);
          const verifiedRaw = await this.storage.getItem(PREFS_KEY_V3);
          const verified = verifiedRaw ? parseV2(verifiedRaw) : null;
          if (verified && JSON.stringify(verified) === JSON.stringify(migrated)) {
            await deleteLegacyPrefsKeys();
            return verified;
          }
        } catch {
          // 保留旧 SecureStore 数据，供下次启动重试迁移。
        }
        return migrated;
      }
      await SecureStore.deleteItemAsync(PREFS_KEY_V1);
    }
    return { ...EMPTY, selectionsByFriendCode: {} };
  }

  private async write(prefs: UploadPrefs): Promise<void> {
    const friendCode = prefs.friendCode.trim();
    const map = sanitizeMap(prefs.selectionsByFriendCode);
    const payload = {
      friendCode,
      selectedAccountIds: friendCode && map[friendCode] ? map[friendCode] : [],
      selectionsByFriendCode: map,
    };
    await this.storage.setItem(PREFS_KEY_V3, JSON.stringify(payload));
  }

  async load(): Promise<UploadPrefs> {
    return this.read();
  }

  /** 取某好友码的勾选；无记录则返回空数组。 */
  async getSelectionFor(friendCode: string): Promise<string[]> {
    const prefs = await this.read();
    const code = friendCode.trim();
    return code && prefs.selectionsByFriendCode[code]
      ? [...prefs.selectionsByFriendCode[code]!]
      : [];
  }

  /**
   * 保存当前好友码。
   * - `writeSelection: false` 时只更新 active 好友码，不改各码勾选表（临时勾选场景）。
   */
  async save(prefs: {
    friendCode: string;
    selectedAccountIds?: string[];
    writeSelection?: boolean;
  }): Promise<void> {
    const current = await this.read();
    const friendCode = prefs.friendCode.trim();
    const map = { ...current.selectionsByFriendCode };
    const writeSelection = prefs.writeSelection !== false;
    if (writeSelection && friendCode && Array.isArray(prefs.selectedAccountIds)) {
      const ids = sanitizeIds(prefs.selectedAccountIds);
      if (ids.length > 0) map[friendCode] = ids;
      else delete map[friendCode];
    }
    await this.write(viewFor(friendCode, map));
  }

  /** 删除某好友码的勾选记录（例如历史 JWT 删除时同步清理）。 */
  async removeSelection(friendCode: string): Promise<void> {
    const code = friendCode.trim();
    if (!code) return;
    const current = await this.read();
    const map = { ...current.selectionsByFriendCode };
    delete map[code];
    const nextActive = current.friendCode === code
      ? (Object.keys(map)[0] ?? '')
      : current.friendCode;
    await this.write(viewFor(nextActive, map));
  }

  async clear(): Promise<void> {
    await this.storage.removeItem(PREFS_KEY_V3);
    await SecureStore.deleteItemAsync(PREFS_KEY_V2);
    await SecureStore.deleteItemAsync(PREFS_KEY_V1);
  }
}

export const uploadPrefsStore = new UploadPrefsStore();

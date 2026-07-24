import * as SecureStore from 'expo-secure-store';

const ACCOUNT_KEY = 'rranker.scorehub.account.v1';

export type ScoreHubAccountState = {
  friendCode: string;
  hasCabinetBound: boolean;
  token?: string;
};

const EMPTY: ScoreHubAccountState = {
  friendCode: '',
  hasCabinetBound: false,
};

export class ScoreHubAccountStore {
  async load(): Promise<ScoreHubAccountState> {
    const raw = await SecureStore.getItemAsync(ACCOUNT_KEY);
    if (!raw) return { ...EMPTY };
    try {
      const parsed = JSON.parse(raw) as Partial<ScoreHubAccountState>;
      return {
        friendCode: typeof parsed.friendCode === 'string' ? parsed.friendCode : '',
        hasCabinetBound: parsed.hasCabinetBound === true,
        token: typeof parsed.token === 'string' && parsed.token ? parsed.token : undefined,
      };
    } catch {
      await this.clear();
      return { ...EMPTY };
    }
  }

  async save(state: ScoreHubAccountState): Promise<void> {
    const next: ScoreHubAccountState = {
      friendCode: state.friendCode.trim(),
      hasCabinetBound: state.hasCabinetBound === true,
      ...(typeof state.token === 'string' && state.token ? { token: state.token } : {}),
    };
    await SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify(next), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async patch(partial: Partial<ScoreHubAccountState>): Promise<ScoreHubAccountState> {
    const current = await this.load();
    const next: ScoreHubAccountState = {
      friendCode: typeof partial.friendCode === 'string' ? partial.friendCode : current.friendCode,
      hasCabinetBound: typeof partial.hasCabinetBound === 'boolean'
        ? partial.hasCabinetBound
        : current.hasCabinetBound,
    };
    if (partial.token !== undefined) {
      if (partial.token) next.token = partial.token;
    } else if (current.token) {
      next.token = current.token;
    }
    await this.save(next);
    return next;
  }

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCOUNT_KEY);
  }
}

export const scoreHubAccountStore = new ScoreHubAccountStore();

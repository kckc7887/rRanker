import Storage from 'expo-sqlite/kv-store';

export type PhigrosImageStyleMode = 'current' | 'item' | 'random' | 'off';
export type PhigrosImageStyleChoice = { mode: PhigrosImageStyleMode; key?: string };
export type PhigrosBestImageStylePreferences = {
  version: 1;
  avatar: PhigrosImageStyleChoice;
  background: PhigrosImageStyleChoice;
};

const PREFIX = 'rranker.phigros-best-image.styles.v1:';
const defaults: PhigrosBestImageStylePreferences = {
  version: 1, avatar: { mode: 'current' }, background: { mode: 'current' },
};

function parseChoice(value: unknown): PhigrosImageStyleChoice {
  if (!value || typeof value !== 'object') return { mode: 'current' };
  const raw = value as { mode?: unknown; key?: unknown };
  if (raw.mode === 'off' || raw.mode === 'current') return { mode: raw.mode };
  if ((raw.mode === 'item' || raw.mode === 'random') && typeof raw.key === 'string' && raw.key) {
    return { mode: raw.mode, key: raw.key };
  }
  return { mode: 'current' };
}

export function parsePhigrosBestImageStylePreferences(value: unknown): PhigrosBestImageStylePreferences {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) return defaults;
  const raw = value as { avatar?: unknown; background?: unknown };
  return { version: 1, avatar: parseChoice(raw.avatar), background: parseChoice(raw.background) };
}

export const phigrosBestImagePreferencesStore = {
  async load(accountId: string): Promise<PhigrosBestImageStylePreferences> {
    try {
      const raw = await Storage.getItem(`${PREFIX}${accountId}`);
      return raw ? parsePhigrosBestImageStylePreferences(JSON.parse(raw)) : defaults;
    } catch { return defaults; }
  },
  async save(accountId: string, value: PhigrosBestImageStylePreferences): Promise<void> {
    await Storage.setItem(`${PREFIX}${accountId}`, JSON.stringify(value));
  },
};

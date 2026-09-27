import { create } from 'zustand';
import {
  DEFAULT_THEME_PREFERENCES,
  themePreferencesStore,
  type AppAccent,
  type AppAppearance,
  type ThemePreferences,
} from '@/storage/theme-preferences-store';
import { normalizeAccentHex } from '@/theme/accent-color';
import { createPreferencesWriteCoordinator } from '@/services/preferences-write-coordinator';
import { recordRuntimeDiagnostic, recordRuntimeError } from '@/services/runtime-diagnostics-recorder';

interface ThemeState extends ThemePreferences {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setAppearance: (appearance: AppAppearance) => Promise<void>;
  setAccent: (accent: Exclude<AppAccent, 'custom'>) => Promise<void>;
  setCustomAccent: (hex: string) => Promise<void>;
  setScoreCardArtworkEnabled: (enabled: boolean) => Promise<void>;
  setScoreCardArtworkTransparency: (transparency: number) => Promise<void>;
  setScoreCardArtworkBlur: (blur: number) => Promise<void>;
}

let hydrationPromise: Promise<void> | undefined;

const persistence = createPreferencesWriteCoordinator<ThemePreferences>({
  load: () => themePreferencesStore.load(),
  save: (value) => themePreferencesStore.save(value),
  loaded: (value) => useThemeStore.setState(value),
  failed: (phase, error, attempts) => {
    if (attempts === 1 || (attempts & (attempts - 1)) === 0) {
      recordRuntimeError('theme-preferences', error, false, { phase });
    }
  },
  recovered: () => { void recordRuntimeDiagnostic('operation', { source: 'theme-preferences', phase: 'recovered' }); },
});

export function setThemePersistenceForeground(foreground: boolean): void { persistence.setForeground(foreground); }

export const useThemeStore = create<ThemeState>((set) => ({
  ...DEFAULT_THEME_PREFERENCES,
  hydrated: false,
  hydrate: () => {
    hydrationPromise ??= (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([persistence.flush(), new Promise<void>((resolve) => { timer = setTimeout(resolve, 1_500); })]);
      } finally { if (timer) clearTimeout(timer); set({ hydrated: true }); }
    })();
    return hydrationPromise;
  },
  setAppearance: async (appearance) => {
    set({ appearance });
    persistence.change({ appearance });
  },
  setAccent: async (accent) => {
    set({ accent });
    persistence.change({ accent });
  },
  setCustomAccent: async (hex) => {
    const normalized = normalizeAccentHex(hex);
    if (!normalized) return;
    set({ accent: 'custom', customHex: normalized });
    persistence.change({ accent: 'custom', customHex: normalized });
  },
  setScoreCardArtworkEnabled: async (enabled) => {
    set({ scoreCardArtworkEnabled: enabled });
    persistence.change({ scoreCardArtworkEnabled: enabled });
  },
  setScoreCardArtworkTransparency: async (transparency) => {
    const next = Math.round(Math.max(0, Math.min(100, transparency)));
    set({ scoreCardArtworkTransparency: next });
    persistence.change({ scoreCardArtworkTransparency: next });
  },
  setScoreCardArtworkBlur: async (blur) => {
    const next = Math.round(Math.max(0, Math.min(30, blur)));
    set({ scoreCardArtworkBlur: next });
    persistence.change({ scoreCardArtworkBlur: next });
  },
}));

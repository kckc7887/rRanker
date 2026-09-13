import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import { useSession } from '@/state/session-store';
import { useThemeStore } from '@/state/theme-store';
import { useDebugStore } from '@/state/debug-store';
import { ensureUiIconFontsLoaded } from '@/features/storage-management/ui-icon-fonts';
import { restoreAppAccounts } from '@/services/account-restoration';
import { initializeRuntimeDiagnostics } from '@/services/runtime-diagnostics';
import { initializeRuntimeLogs } from '@/services/runtime-logs';
import { startTimer } from '@/utils/startup-timing';

export function useAppStartup(): boolean {
  const restoreStatus = useSession((state) => state.restoreStatus);
  const themeHydrated = useThemeStore((state) => state.hydrated);
  const hydrateTheme = useThemeStore((state) => state.hydrate);
  const appearance = useThemeStore((state) => state.appearance);
  const hydrateDebug = useDebugStore((state) => state.hydrate);
  const [iconFontsReady, setIconFontsReady] = useState(false);
  useEffect(() => {
    void initializeRuntimeDiagnostics();
    void initializeRuntimeLogs().catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stop = startTimer('root.iconFonts');
    void ensureUiIconFontsLoaded()
      .catch(() => undefined)
      .finally(() => {
        stop();
        if (!cancelled) setIconFontsReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (restoreStatus === 'restoring') {
      const stop = startTimer('root.restoreTotal');
      void restoreAppAccounts()
        .then(() => {
          stop();
        });
    }
  }, [restoreStatus]);

  useEffect(() => {
    const stop = startTimer('root.themeHydrate');
    void hydrateTheme().finally(stop);
  }, [hydrateTheme]);
  useEffect(() => { Appearance.setColorScheme(appearance === 'system' ? null : appearance); }, [appearance]);

  useEffect(() => { void hydrateDebug().catch(() => undefined); }, [hydrateDebug]);

  return restoreStatus !== 'restoring' && themeHydrated && iconFontsReady;
}

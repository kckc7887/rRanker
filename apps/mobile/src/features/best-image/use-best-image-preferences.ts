import { useEffect, useRef, useState } from 'react';

export function useBestImagePreferences<TPrefs>(config: {
  accountId: string;
  defaultPreferences: TPrefs;
  preferences: { load: (id: string) => Promise<TPrefs>; save: (id: string, prefs: TPrefs) => Promise<void> };
  onPreferencesLoadStart?: () => void;
}) {
  const configRef = useRef(config);
  configRef.current = config;
  const [prefs, setPrefs] = useState(config.defaultPreferences);
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);
  const prefsReady = loadedAccountId === config.accountId;
  useEffect(() => {
    let cancelled = false;
    setLoadedAccountId(null);
    configRef.current.onPreferencesLoadStart?.();
    void configRef.current.preferences.load(config.accountId).then((value) => {
      if (cancelled) return;
      setPrefs(value);
      setLoadedAccountId(config.accountId);
    });
    return () => { cancelled = true; };
  }, [config.accountId]);
  useEffect(() => {
    if (prefsReady) void configRef.current.preferences.save(config.accountId, prefs);
  }, [config.accountId, prefs, prefsReady]);
  return { prefs, setPrefs, prefsReady };
}

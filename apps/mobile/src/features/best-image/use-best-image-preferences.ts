import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { useNotification } from '@/components/AppNotification';
import { createPreferencesWriteCoordinator } from '@/services/preferences-write-coordinator';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import { useAppLifecycle } from '@/state/app-lifecycle';

export function useBestImagePreferences<TPrefs extends object>(config: {
  accountId: string;
  defaultPreferences: TPrefs;
  preferences: { load: (id: string) => Promise<TPrefs>; save: (id: string, prefs: TPrefs) => Promise<void> };
  onPreferencesLoadStart?: () => void;
}) {
  const configRef = useRef(config);
  configRef.current = config;
  const { showNotification } = useNotification();
  const notifyRef = useRef(showNotification);
  notifyRef.current = showNotification;
  const { foregroundReady } = useAppLifecycle();
  type Document = {
    prefs: TPrefs; ready: boolean; active: boolean;
    persistence: ReturnType<typeof createPreferencesWriteCoordinator<TPrefs>>;
  };
  const currentRef = useRef<Document | null>(null);
  const [view, setView] = useState<{ document: Document; prefs: TPrefs; ready: boolean } | null>(null);
  const document = useMemo(() => {
    const accountId = config.accountId;
    const preferences = configRef.current.preferences;
    const next: Document = { prefs: configRef.current.defaultPreferences, ready: false, active: true,
      persistence: createPreferencesWriteCoordinator<TPrefs>({
        load: () => preferences.load(accountId),
        save: (value) => preferences.save(accountId, value),
        loaded: (value) => {
          if (!next.active || currentRef.current !== next) return;
          next.prefs = value;
          next.ready = true;
          setView({ document: next, prefs: value, ready: true });
        },
        failed: (phase, error, attempts) => {
          if (!next.active || currentRef.current !== next) return;
          if (attempts === 1 || (attempts & (attempts - 1)) === 0) recordRuntimeError('best-image-preferences', error, false, { phase });
          if (attempts === 1) notifyRef.current({
            title: phase === 'read' ? '样式读取失败' : '样式保存失败',
            message: phase === 'read' ? '原有样式已保留，正在自动重试读取。' : '当前选择已保留，正在自动重试保存。',
            variant: 'warning',
          });
        },
      }),
    };
    return next;
  }, [config.accountId]);
  currentRef.current = document;
  useEffect(() => {
    document.active = true;
    configRef.current.onPreferencesLoadStart?.();
    return () => { document.active = false; document.persistence.dispose(); };
  }, [document]);
  useEffect(() => { document.persistence.setForeground(foregroundReady); }, [document, foregroundReady]);
  const setPrefs = useCallback((update: SetStateAction<TPrefs>) => {
    const current = currentRef.current;
    if (!current?.active) return;
    const previous = current.prefs;
    const next = typeof update === 'function' ? (update as (value: TPrefs) => TPrefs)(previous) : update;
    const patch: Partial<TPrefs> = {};
    for (const key of new Set([...Object.keys(previous), ...Object.keys(next)]) as Set<keyof TPrefs>) {
      if (!Object.is(previous[key], next[key])) patch[key] = next[key];
    }
    if (!Object.keys(patch).length) return;
    current.prefs = next;
    setView({ document: current, prefs: next, ready: current.ready });
    current.persistence.change(patch);
  }, []);
  return { prefs: view?.document === document ? view.prefs : document.prefs,
    setPrefs, prefsReady: view?.document === document && view.ready };
}

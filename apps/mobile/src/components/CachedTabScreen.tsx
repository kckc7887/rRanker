import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useFocusEffect } from 'expo-router';
import { Freeze } from 'react-freeze';
import { InteractionManager, StyleSheet, View } from 'react-native';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { useAppTheme } from '@/theme/app-theme';
import { RemoteImageActivityScope } from '@/components/RemoteImage';

const CachedTabActiveContext = createContext(true);

export function useCachedTabActive(): boolean {
  return useContext(CachedTabActiveContext);
}

function DelayedFreeze({ freeze, children }: { freeze: boolean; children: ReactNode }) {
  const [freezeState, setFreezeState] = useState(false);
  useEffect(() => {
    if (!freeze) {
      setFreezeState(false);
      return undefined;
    }
    const id = setTimeout(() => {
      setFreezeState(true);
    }, 0);
    return () => {
      clearTimeout(id);
    };
  }, [freeze]);
  return <Freeze freeze={freeze && freezeState}>{children}</Freeze>;
}

export function CachedTabScreen({ children }: { children: ReactNode }) {
  const theme = useAppTheme();
  const lifecycle = useAppLifecycle();
  const activatedRef = useRef(false);
  const cachedChildrenRef = useRef(children);
  const focusedRef = useRef(false);
  const foregroundReadyRef = useRef(lifecycle.foregroundReady);
  const memoryWarningRef = useRef(lifecycle.memoryWarningGeneration);
  const activationTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);
  const [activated, setActivated] = useState(false);
  const [active, setActive] = useState(false);

  const stopActivation = useCallback(() => {
    activationTaskRef.current?.cancel();
    activationTaskRef.current = null;
    setActive(false);
  }, []);

  const scheduleActivation = useCallback(() => {
    activationTaskRef.current?.cancel();
    activationTaskRef.current = null;
    if (!focusedRef.current || !foregroundReadyRef.current) return;
    activationTaskRef.current = InteractionManager.runAfterInteractions(() => {
      if (!focusedRef.current || !foregroundReadyRef.current) return;
      if (!activatedRef.current) {
        activatedRef.current = true;
        setActivated(true);
      }
      setActive(true);
    });
  }, []);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    scheduleActivation();
    return () => {
      focusedRef.current = false;
      stopActivation();
    };
  }, [scheduleActivation, stopActivation]));

  useEffect(() => {
    foregroundReadyRef.current = lifecycle.foregroundReady;
    const memoryWarning = lifecycle.memoryWarningGeneration > memoryWarningRef.current;
    memoryWarningRef.current = lifecycle.memoryWarningGeneration;
    if (memoryWarning && !focusedRef.current) {
      activatedRef.current = false;
      setActivated(false);
      stopActivation();
      return undefined;
    }
    if (lifecycle.foregroundReady) {
      scheduleActivation();
      return () => {
        activationTaskRef.current?.cancel();
        activationTaskRef.current = null;
      };
    }
    stopActivation();
    return undefined;
  }, [lifecycle.foregroundGeneration, lifecycle.foregroundReady, lifecycle.memoryWarningGeneration, scheduleActivation, stopActivation]);

  if (!activated) {
    return <View testID="cached-tab-placeholder" style={[styles.page, { backgroundColor: theme.background }]} />;
  }

  return (
    <RemoteImageActivityScope active={active}>
      <CachedTabActiveContext.Provider value={active}>
        <DelayedFreeze freeze={!active}>
          {cachedChildrenRef.current}
        </DelayedFreeze>
      </CachedTabActiveContext.Provider>
    </RemoteImageActivityScope>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
});

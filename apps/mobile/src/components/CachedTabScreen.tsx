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
import { AppState, InteractionManager, StyleSheet, View, type AppStateStatus } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

const CachedTabActiveContext = createContext(true);

function isForeground(state: AppStateStatus | null | undefined): boolean {
  return state !== 'background' && state !== 'inactive';
}

export function useCachedTabActive(): boolean {
  return useContext(CachedTabActiveContext);
}

export function CachedTabScreen({ children }: { children: ReactNode }) {
  const theme = useAppTheme();
  const activatedRef = useRef(false);
  const cachedChildrenRef = useRef(children);
  const focusedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus | null | undefined>(AppState.currentState);
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
    if (!focusedRef.current || !isForeground(appStateRef.current)) return;
    activationTaskRef.current = InteractionManager.runAfterInteractions(() => {
      if (!focusedRef.current || !isForeground(appStateRef.current)) return;
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
    const subscription = AppState.addEventListener('change', (state) => {
      appStateRef.current = state;
      if (isForeground(state)) scheduleActivation();
      else stopActivation();
    });
    return () => {
      subscription.remove();
      stopActivation();
    };
  }, [scheduleActivation, stopActivation]);

  if (!activated) {
    return <View testID="cached-tab-placeholder" style={[styles.page, { backgroundColor: theme.background }]} />;
  }

  return (
    <CachedTabActiveContext.Provider value={active}>
      {cachedChildrenRef.current}
    </CachedTabActiveContext.Provider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
});

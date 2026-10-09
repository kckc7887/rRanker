import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useIsFocused, type NavigationProp, type NavigationState, type ParamListBase } from '@react-navigation/native';
import { Platform, StyleSheet, View } from 'react-native';
import { Freeze } from 'react-freeze';
import { scheduleIdleTask, useAppLifecycle } from '@/state/app-lifecycle';
import { useAppTheme } from '@/theme/app-theme';
import { RemoteImageActivityScope } from '@/components/RemoteImage';

const CachedTabActiveContext = createContext(true);
const StackScreenReadyContext = createContext(true);
type StackTransitionEvents = {
  transitionStart: { data: { closing: boolean } };
  transitionEnd: { data: { closing: boolean } };
  gestureCancel: { data: undefined };
};

export function useCachedTabActive(): boolean {
  return useContext(CachedTabActiveContext);
}

export function CachedContentActivityScope({ active, children }: { active: boolean; children: ReactNode }) {
  const parentActive = useCachedTabActive();
  return <CachedTabActiveContext.Provider value={parentActive && active}>{children}</CachedTabActiveContext.Provider>;
}

export function useStackScreenReady(): boolean {
  return useContext(StackScreenReadyContext);
}

export function StackScreenActivityScope({ children }: { children: ReactNode }) {
  const navigation = useNavigation<NavigationProp<ParamListBase, string, undefined, NavigationState, object, StackTransitionEvents>>();
  const focused = useIsFocused();
  const { foregroundReady } = useAppLifecycle();
  const [settled, setSettled] = useState(false);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    if (Platform.OS === 'web') return;
    const start = navigation.addListener('transitionStart', () => setSettled(false));
    const end = navigation.addListener('transitionEnd', (event) => {
      if (event.data.closing) return;
      setSettled(true);
      setReady(true);
    });
    const cancel = navigation.addListener('gestureCancel', () => {
      if (!navigation.isFocused()) return;
      setSettled(true);
      setReady(true);
    });
    return () => { start(); end(); cancel(); };
  }, [navigation]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!focused || !foregroundReady) {
      setSettled(false);
      return;
    }
    return scheduleIdleTask(() => { setSettled(true); setReady(true); });
  }, [focused, foregroundReady]);

  const active = focused && foregroundReady && settled;
  return <StackScreenReadyContext.Provider value={ready}>
    <CachedContentActivityScope active={active}>
      <RemoteImageActivityScope active={active}>{children}</RemoteImageActivityScope>
    </CachedContentActivityScope>
  </StackScreenReadyContext.Provider>;
}

export function CachedTabScreen({ children }: { children: ReactNode }) {
  const theme = useAppTheme();
  const lifecycle = useAppLifecycle();
  const focused = useIsFocused();
  const activatedRef = useRef(false);
  const cachedChildrenRef = useRef(children);
  const focusedRef = useRef(false);
  const foregroundReadyRef = useRef(lifecycle.foregroundReady);
  const memoryWarningRef = useRef(lifecycle.memoryWarningGeneration);
  const activationTaskRef = useRef<(() => void) | null>(null);
  const freezeTaskRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activated, setActivated] = useState(false);
  const [active, setActive] = useState(false);
  const [frozen, setFrozen] = useState(false);

  const stopActivation = useCallback(() => {
    activationTaskRef.current?.();
    activationTaskRef.current = null;
    setActive(false);
  }, []);

  const scheduleActivation = useCallback(() => {
    activationTaskRef.current?.();
    activationTaskRef.current = null;
    if (!focusedRef.current || !foregroundReadyRef.current) return;
    if (freezeTaskRef.current !== null) clearTimeout(freezeTaskRef.current);
    freezeTaskRef.current = null;
    setFrozen(false);
    activationTaskRef.current = scheduleIdleTask(() => {
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
        activationTaskRef.current?.();
        activationTaskRef.current = null;
      };
    }
    stopActivation();
    return undefined;
  }, [lifecycle.foregroundGeneration, lifecycle.foregroundReady, lifecycle.memoryWarningGeneration, scheduleActivation, stopActivation]);

  useEffect(() => {
    if (active || !activated) return;
    /** 先提交失活状态，让后代停止工作，再冻结订阅更新。 */
    freezeTaskRef.current = setTimeout(() => {
      freezeTaskRef.current = null;
      if (!focusedRef.current || !foregroundReadyRef.current) setFrozen(true);
    }, 0);
    return () => {
      if (freezeTaskRef.current !== null) clearTimeout(freezeTaskRef.current);
      freezeTaskRef.current = null;
    };
  }, [active, activated, focused, lifecycle.foregroundReady]);

  if (!activated) {
    return <View testID="cached-tab-placeholder" style={[styles.page, { backgroundColor: theme.background }]} />;
  }

  return (
    <RemoteImageActivityScope active={active}>
      <CachedTabActiveContext.Provider value={active}>
        <Freeze freeze={frozen}>{cachedChildrenRef.current}</Freeze>
      </CachedTabActiveContext.Provider>
    </RemoteImageActivityScope>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
});

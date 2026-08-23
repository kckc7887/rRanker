import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { useFocusEffect } from 'expo-router';
import { InteractionManager, StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

const CachedTabActiveContext = createContext(true);

export function useCachedTabActive(): boolean {
  return useContext(CachedTabActiveContext);
}

export function CachedTabScreen({ children }: { children: ReactNode }) {
  const theme = useAppTheme();
  const activatedRef = useRef(false);
  const cachedChildrenRef = useRef(children);
  const [activated, setActivated] = useState(false);
  const [active, setActive] = useState(false);

  useFocusEffect(useCallback(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      if (!activatedRef.current) {
        activatedRef.current = true;
        setActivated(true);
      }
      setActive(true);
    });
    return () => {
      task.cancel();
      setActive(false);
    };
  }, []));

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

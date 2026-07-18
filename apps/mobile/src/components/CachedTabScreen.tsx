import { type ReactNode, useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { InteractionManager, StyleSheet, View } from 'react-native';

export function CachedTabScreen({ children }: { children: ReactNode }) {
  const activatedRef = useRef(false);
  const [activated, setActivated] = useState(false);

  useFocusEffect(useCallback(() => {
    if (activatedRef.current) return undefined;

    const task = InteractionManager.runAfterInteractions(() => {
      activatedRef.current = true;
      setActivated(true);
    });
    return () => task.cancel();
  }, []));

  if (!activated) {
    return <View testID="cached-tab-placeholder" style={styles.page} />;
  }

  return children;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
});

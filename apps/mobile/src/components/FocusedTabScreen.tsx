import { type ReactNode, useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { InteractionManager, StyleSheet, View } from 'react-native';

export function FocusedTabScreen({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useFocusEffect(useCallback(() => {
    let focused = true;
    const task = InteractionManager.runAfterInteractions(() => {
      if (focused) setReady(true);
    });
    return () => {
      focused = false;
      task.cancel();
      setReady(false);
    };
  }, []));

  if (!ready) return <View testID="focused-tab-placeholder" style={styles.placeholder} />;
  return children;
}

const styles = StyleSheet.create({
  placeholder: { flex: 1, backgroundColor: '#F7F8FA' },
});

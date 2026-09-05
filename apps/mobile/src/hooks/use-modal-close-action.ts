import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export function useModalDismissal(visible: boolean, onDismiss?: () => void) {
  const wasVisible = useRef(visible);
  const callback = useRef(onDismiss);
  callback.current = onDismiss;
  useEffect(() => {
    const closed = wasVisible.current && !visible;
    wasVisible.current = visible;
    // Android removes the native host when visible becomes false; only iOS
    // retains it for the dismissal animation and emits onDismiss afterwards.
    if (closed && Platform.OS !== 'ios') callback.current?.();
  }, [visible]);
  return useCallback(() => {
    if (Platform.OS === 'ios') callback.current?.();
  }, []);
}

export function useModalCloseAction(setVisible: (visible: boolean) => void) {
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => () => { pending.current = null; }, []);
  const close = useCallback((action?: () => void) => {
    pending.current = action ?? null;
    setVisible(false);
  }, [setVisible]);
  const onDismiss = useCallback(() => {
    const action = pending.current;
    pending.current = null;
    action?.();
  }, []);
  return { close, onDismiss };
}

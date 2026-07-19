import { Modal, StyleSheet, type ModalProps } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import {
  NotificationOutlet,
  useNotificationModalRequestClose,
} from '@/components/AppNotification';

export function AppModal({ children, onRequestClose, visible = true, ...props }: ModalProps) {
  const requestCloseNotification = useNotificationModalRequestClose();

  return (
    <Modal
      {...props}
      visible={visible}
      onRequestClose={(event) => {
        if (!requestCloseNotification()) onRequestClose?.(event);
      }}
    >
      <GestureHandlerRootView style={styles.root}>
        {children}
        {visible ? <NotificationOutlet /> : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

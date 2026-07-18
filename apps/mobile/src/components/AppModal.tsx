import { Modal, type ModalProps } from 'react-native';

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
      {children}
      {visible ? <NotificationOutlet /> : null}
    </Modal>
  );
}

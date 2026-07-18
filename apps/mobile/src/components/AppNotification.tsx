import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type NotificationVariant = 'success' | 'info' | 'warning' | 'error';
export type NotificationActionTone = 'default' | 'cancel' | 'destructive';

export type NotificationAction = {
  label: string;
  tone?: NotificationActionTone;
  onPress?: () => void | Promise<void>;
};

export type NotificationInput = {
  title: string;
  message?: string;
  variant?: NotificationVariant;
  duration?: number | null;
};

export type ActionNotificationInput = Omit<NotificationInput, 'duration'> & {
  actions: readonly NotificationAction[];
};

type QueuedNotification = NotificationInput & {
  id: number;
  actions?: readonly NotificationAction[];
};

type NotificationContextValue = {
  showNotification: (input: NotificationInput) => number;
  showActionNotification: (input: ActionNotificationInput) => number;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);
const ENTER_DURATION = 220;
const EXIT_DURATION = 180;

const VARIANT_META: Record<NotificationVariant, {
  color: string;
  backgroundColor: string;
  icon: ComponentProps<typeof Ionicons>['name'];
}> = {
  success: { color: '#067647', backgroundColor: '#ECFDF3', icon: 'checkmark-circle' },
  info: { color: '#246BFD', backgroundColor: '#EEF4FF', icon: 'information-circle' },
  warning: { color: '#B54708', backgroundColor: '#FFFAEB', icon: 'warning' },
  error: { color: '#B42318', backgroundColor: '#FEF3F2', icon: 'close-circle' },
};

function defaultDuration(variant: NotificationVariant): number {
  return variant === 'warning' || variant === 'error' ? 5000 : 3000;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<QueuedNotification[]>([]);
  const nextIdRef = useRef(1);

  const enqueue = useCallback((input: NotificationInput, actions?: readonly NotificationAction[]) => {
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    setNotifications((current) => [...current, { ...input, id, actions }]);
    return id;
  }, []);

  const showNotification = useCallback(
    (input: NotificationInput) => enqueue(input),
    [enqueue],
  );
  const showActionNotification = useCallback(
    (input: ActionNotificationInput) => enqueue(input, input.actions),
    [enqueue],
  );
  const removeNotification = useCallback((id: number) => {
    setNotifications((current) => current[0]?.id === id
      ? current.slice(1)
      : current.filter((item) => item.id !== id));
  }, []);

  const value = useMemo(
    () => ({ showNotification, showActionNotification }),
    [showActionNotification, showNotification],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {notifications[0] ? (
        <NotificationHost
          key={notifications[0].id}
          notification={notifications[0]}
          onRemoved={removeNotification}
        />
      ) : null}
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextValue {
  const value = useContext(NotificationContext);
  if (!value) throw new Error('useNotification 必须在 NotificationProvider 内使用');
  return value;
}

function NotificationHost({
  notification,
  onRemoved,
}: {
  notification: QueuedNotification;
  onRemoved: (id: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const exitingRef = useRef(false);
  const actionHandledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const variant = notification.variant ?? 'info';
  const actions = notification.actions;
  const isAction = Boolean(actions?.length);

  const dismiss = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: EXIT_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: EXIT_DURATION,
        useNativeDriver: true,
      }),
    ]).start(() => onRemoved(notification.id));
  }, [notification.id, onRemoved, opacity, translateY]);

  const performAction = useCallback((action: NotificationAction) => {
    if (actionHandledRef.current) return;
    actionHandledRef.current = true;
    dismiss();
    try {
      const result = action.onPress?.();
      if (result) void result.catch((error) => console.error('通知操作执行失败', error));
    } catch (error) {
      console.error('通知操作执行失败', error);
    }
  }, [dismiss]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        damping: 18,
        stiffness: 180,
        mass: 0.8,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: ENTER_DURATION,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished || isAction || notification.duration === null) return;
      timerRef.current = setTimeout(
        dismiss,
        notification.duration ?? defaultDuration(variant),
      );
    });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      translateY.stopAnimation();
      opacity.stopAnimation();
    };
  }, [dismiss, isAction, notification.duration, opacity, translateY, variant]);

  const requestClose = useCallback(() => {
    const cancelAction = actions?.find((action) => action.tone === 'cancel');
    if (isAction && cancelAction) performAction(cancelAction);
    else dismiss();
  }, [actions, dismiss, isAction, performAction]);

  const meta = VARIANT_META[variant];
  return (
    <Modal
      animationType="none"
      hardwareAccelerated
      onRequestClose={requestClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      testID="app-notification-modal"
      transparent
      visible
    >
      <View
        pointerEvents={isAction ? 'auto' : 'box-none'}
        style={[styles.overlay, { paddingTop: insets.top + 8 }]}
        testID="app-notification-overlay"
      >
        {isAction ? (
          <Pressable
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onPress={() => undefined}
            style={styles.backdrop}
            testID="app-notification-backdrop"
          />
        ) : null}
        <Animated.View
          accessibilityLiveRegion={variant === 'error' ? 'assertive' : 'polite'}
          accessibilityRole="alert"
          style={[
            styles.card,
            { borderLeftColor: meta.color, opacity, transform: [{ translateY }] },
          ]}
          testID="app-notification-card"
        >
          <View style={[styles.icon, { backgroundColor: meta.backgroundColor }]}>
            <Ionicons color={meta.color} name={meta.icon} size={22} />
          </View>
          <View style={styles.content}>
            <Text style={styles.title}>{notification.title}</Text>
            {notification.message ? <Text style={styles.message}>{notification.message}</Text> : null}
            {actions?.length ? (
              <View style={styles.actions}>
                {actions.map((action, index) => (
                  <Pressable
                    accessibilityRole="button"
                    disabled={actionHandledRef.current}
                    key={`${action.label}-${index}`}
                    onPress={() => performAction(action)}
                    style={({ pressed }) => [
                      styles.action,
                      action.tone === 'destructive' && styles.destructiveAction,
                      action.tone === 'cancel' && styles.cancelAction,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[
                      styles.actionText,
                      action.tone === 'destructive' && styles.destructiveActionText,
                      action.tone === 'cancel' && styles.cancelActionText,
                    ]}>
                      {action.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
          {!isAction ? (
            <Pressable
              accessibilityLabel="关闭通知"
              accessibilityRole="button"
              hitSlop={10}
              onPress={dismiss}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            >
              <Ionicons color="#667085" name="close" size={20} />
            </Pressable>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.18)',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderLeftWidth: 4,
    backgroundColor: '#FFFFFF',
    shadowColor: '#101828',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, gap: 4 },
  title: { color: '#101828', fontSize: 16, fontWeight: '700', lineHeight: 22 },
  message: { color: '#475467', fontSize: 14, lineHeight: 20 },
  close: { padding: 2 },
  actions: { marginTop: 10, gap: 8 },
  action: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#246BFD',
  },
  cancelAction: { backgroundColor: '#F2F4F7' },
  destructiveAction: { backgroundColor: '#FEF3F2', borderWidth: 1, borderColor: '#FDA29B' },
  actionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  cancelActionText: { color: '#344054' },
  destructiveActionText: { color: '#B42318' },
  pressed: { opacity: 0.72 },
});

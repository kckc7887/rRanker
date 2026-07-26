import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppModal } from '@/components/AppModal';
import { useNotification } from '@/components/AppNotification';
import {
  listArcadeMapApps,
  resolveArcadeNavigateDestination,
  type ArcadeMapAppId,
  type ArcadeNavigateTarget,
} from '@/domain/arcade-shops';
import { useAppTheme } from '@/theme/app-theme';
import { openArcadeMapApp } from '@/utils/open-arcade-navigation';

export function ArcadeMapPickerSheet({
  visible,
  shop,
  onClose,
}: {
  visible: boolean;
  shop: ArcadeNavigateTarget | null;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { showNotification } = useNotification();
  const apps = listArcadeMapApps(Platform.OS);
  const destination = shop ? resolveArcadeNavigateDestination(shop) : '';

  const selectApp = async (app: ArcadeMapAppId) => {
    if (!shop) return;
    onClose();
    const opened = await openArcadeMapApp(app, shop);
    if (!opened) {
      const label = apps.find((item) => item.id === app)?.label ?? '地图';
      showNotification({
        title: '无法打开地图',
        message: `请确认已安装${label}。`,
        variant: 'warning',
      });
    }
  };

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>选择地图</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭"
            hitSlop={12}
            onPress={onClose}
            style={({ pressed }) => [styles.closeHit, pressed && styles.softPressed]}
          >
            <Text style={[styles.close, { color: theme.accent }]}>取消</Text>
          </Pressable>
        </View>
        {destination ? (
          <Text style={[styles.destination, { color: theme.textMuted }]} numberOfLines={3}>
            {destination}
          </Text>
        ) : null}
        <View style={styles.list}>
          {apps.map((app) => (
            <Pressable
              key={app.id}
              accessibilityRole="button"
              accessibilityLabel={`使用${app.label}导航`}
              onPress={() => { void selectApp(app.id); }}
              style={({ pressed }) => [
                styles.option,
                { backgroundColor: theme.surface, borderColor: theme.border },
                pressed && { backgroundColor: theme.surfaceMuted },
              ]}
            >
              <Text style={[styles.optionText, { color: theme.text }]}>{app.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 999, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '800' },
  closeHit: { minHeight: 32, paddingHorizontal: 4, justifyContent: 'center' },
  close: { fontSize: 16, fontWeight: '700' },
  softPressed: { opacity: 0.62 },
  destination: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  list: { gap: 10 },
  option: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  optionText: { fontSize: 16, fontWeight: '700' },
});

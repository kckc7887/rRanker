import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

export type MaimaiUploadPage = 'friend_code' | 'qr' | 'lxns_guide';

export function MaimaiUploadTabs({
  value,
  disabled,
  onChange,
}: {
  value: MaimaiUploadPage;
  disabled: boolean;
  onChange: (value: MaimaiUploadPage) => void;
}) {
  const theme = useAppTheme();

  return (
    <View
      accessibilityLabel="舞萌上传方式"
      style={[styles.track, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}
    >
      <Tab
        label="好友码"
        selected={value === 'friend_code'}
        disabled={disabled}
        onPress={() => onChange('friend_code')}
      />
      <Tab
        label="玩家二维码"
        selected={value === 'qr'}
        disabled={disabled}
        onPress={() => onChange('qr')}
      />
      <Tab
        label="同步引导"
        selected={value === 'lxns_guide'}
        disabled={disabled}
        onPress={() => onChange('lxns_guide')}
      />
    </View>
  );
}

function Tab({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={`切换到${label}页面`}
      accessibilityRole="tab"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tab,
        selected && [styles.selected, { backgroundColor: theme.surface }],
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[
        styles.label,
        { color: selected ? theme.accent : theme.textSecondary },
      ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 3,
  },
  tab: {
    flex: 1,
    minHeight: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: { fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
});

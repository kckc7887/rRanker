import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppModal } from '@/components/AppModal';
import {
  LOCAL_PLAYER_NAME_MAX_LENGTH,
  normalizeLocalPlayerName,
} from '@/storage/local-account-store';
import { useAppTheme } from '@/theme/app-theme';

export function RenameLocalAccountSheet({
  visible,
  initialName,
  onClose,
  onSave,
}: {
  visible: boolean;
  initialName: string;
  onClose: () => void;
  onSave: (displayName: string) => Promise<void>;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState(initialName);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraft(initialName);
    setError('');
    // Focus after the pageSheet finishes presenting — autoFocus during present
    // races the keyboard with Native Tabs and can freeze / stretch the tab bar.
    const handle = InteractionManager.runAfterInteractions(() => {
      inputRef.current?.focus();
    });
    return () => handle.cancel();
  }, [initialName, visible]);

  const save = async () => {
    const displayName = normalizeLocalPlayerName(draft);
    if (!displayName) {
      setError('名称不能为空');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(displayName);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={saving ? undefined : onClose}
    >
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 12) }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <Text style={[styles.title, { color: theme.text }]}>修改本地玩家名称</Text>
        <TextInput
          ref={inputRef}
          accessibilityLabel="本地玩家名称"
          autoCorrect={false}
          editable={!saving}
          maxLength={LOCAL_PLAYER_NAME_MAX_LENGTH}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => void save()}
          returnKeyType="done"
          selectTextOnFocus
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="取消修改名称"
            disabled={saving}
            onPress={onClose}
            style={styles.secondary}
          >
            <Text style={[styles.secondaryText, { color: theme.textSecondary }]}>取消</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="保存本地玩家名称"
            disabled={saving}
            onPress={() => void save()}
            style={[styles.primary, { backgroundColor: theme.accent }, saving && styles.disabled]}
          >
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>保存</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 14,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 999,
    marginBottom: 8,
  },
  title: { color: '#111827', fontSize: 19, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#111827',
    fontSize: 17,
  },
  error: { color: '#B42318', fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  secondary: { paddingHorizontal: 16, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#4B5563', fontSize: 15, fontWeight: '600' },
  primary: {
    minWidth: 82,
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 11,
    backgroundColor: '#246BFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});

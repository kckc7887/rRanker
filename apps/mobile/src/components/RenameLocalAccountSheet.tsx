import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
  const [draft, setDraft] = useState(initialName);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraft(initialName);
    setError('');
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
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={saving ? undefined : onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.title, { color: theme.text }]}>修改本地玩家名称</Text>
          <TextInput
            accessibilityLabel="本地玩家名称"
            autoFocus
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,39,0.42)',
  },
  card: { width: '100%', maxWidth: 420, borderRadius: 18, backgroundColor: '#FFF', padding: 20, gap: 14 },
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
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
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

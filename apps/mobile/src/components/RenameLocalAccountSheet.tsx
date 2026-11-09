import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { AppSheet } from '@/components/AppSheet';
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
  const inputRef = useRef<TextInput>(null);
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
    } catch {
      setError('保存失败，请重试。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppSheet title="修改本地玩家名称" visible={visible}
      onShow={() => { if (visible) inputRef.current?.focus(); }}
      onRequestClose={saving ? undefined : onClose}
      leftAction={{ label: '取消', accessibilityLabel: '取消修改名称', disabled: saving, onPress: onClose }}
      rightAction={{ label: saving ? '保存中…' : '保存', accessibilityLabel: '保存本地玩家名称', disabled: saving, onPress: () => void save() }}>
      <View style={styles.root}>
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
        {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#111827',
    fontSize: 17,
  },
  error: { fontSize: 13 },
});

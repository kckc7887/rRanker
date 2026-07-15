import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView, Pressable as GesturePressable } from 'react-native-gesture-handler';
import { normalizeTags } from '@/domain/user-library';

export function TagEditor({ tags, disabled, onChange }: {
  tags: string[];
  disabled?: boolean;
  onChange: (tags: string[]) => Promise<unknown>;
}) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const commit = async (values: string[]): Promise<boolean> => {
    try { setError(''); await onChange(normalizeTags(values)); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : '标签保存失败'); return false; }
  };

  const add = async () => {
    if (!input.trim()) { setError('请输入标签'); return; }
    if (await commit([...tags, input])) setInput('');
  };

  return <GestureHandlerRootView style={styles.wrap}>
    <Text style={styles.label}>本地标签</Text>
    <View style={styles.tags}>
      {tags.map((tag) => <GesturePressable key={tag} disabled={disabled} accessibilityRole="button"
        accessibilityLabel={`删除标签 ${tag}`} onPress={() => void commit(tags.filter((item) => item !== tag))} style={styles.tag}>
        <Text style={styles.tagText}>{tag} ×</Text>
      </GesturePressable>)}
      {!tags.length ? <Text style={styles.empty}>暂无标签</Text> : null}
    </View>
    <View style={styles.inputRow}>
      <TextInput accessibilityLabel="新标签" editable={!disabled} placeholder="输入标签" value={input}
        onChangeText={setInput} onSubmitEditing={() => void add()} style={styles.input} />
      <GesturePressable accessibilityRole="button" accessibilityLabel="添加标签"
        disabled={disabled} onPress={() => void add()} style={styles.add}>
        <Text style={styles.addText}>添加</Text>
      </GesturePressable>
    </View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  wrap: { gap: 7, marginTop: 9 }, label: { color: '#4B5563', fontSize: 12, fontWeight: '600' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: '#E8EEFF', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5 },
  tagText: { color: '#1D4ED8', fontSize: 11 }, empty: { color: '#9CA3AF', fontSize: 11 },
  inputRow: { flexDirection: 'row', gap: 7 }, input: { flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, color: '#111827' },
  add: { backgroundColor: '#246BFD', borderRadius: 8, paddingHorizontal: 13, justifyContent: 'center' },
  addText: { color: '#FFF', fontWeight: '700', fontSize: 12 }, error: { color: '#B42318', fontSize: 11 },
});

import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutRectangle,
} from 'react-native';
import { GestureHandlerRootView, Pressable as GesturePressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppModal } from '@/components/AppModal';
import { normalizeTagName, normalizeTags } from '@/domain/user-library';
import { useAppTheme } from '@/theme/app-theme';

export function TagEditor({ tags, presets = [], historyTags = [], disabled, onChange, onPresetsChange }: {
  tags: string[];
  presets?: string[];
  historyTags?: string[];
  disabled?: boolean;
  onChange: (tags: string[]) => Promise<unknown>;
  onPresetsChange?: (tags: string[]) => Promise<unknown>;
}) {
  const theme = useAppTheme();
  const GestureRoot = Platform.OS === 'android' ? View : GestureHandlerRootView;
  const TagPressable = Platform.OS === 'android' ? Pressable : GesturePressable;
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);

  const commit = async (values: string[]): Promise<boolean> => {
    try { setError(''); await onChange(normalizeTags(values)); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : '标签保存失败'); return false; }
  };

  const add = async () => {
    if (!input.trim()) { setError('请输入标签'); return; }
    if (await commit([...tags, input])) setInput('');
  };

  return <GestureRoot style={styles.wrap}>
    <Text style={[styles.label, { color: theme.textSecondary }]}>本地标签</Text>
    <View style={styles.tags}>
      {tags.map((tag) => <TagPressable key={tag} disabled={disabled} accessibilityRole="button"
        accessibilityLabel={`删除标签 ${tag}`} onPress={() => void commit(tags.filter((item) => item !== tag))}
        style={[styles.tag, { backgroundColor: theme.accentSoft }]}>
        <Text style={[styles.tagText, { color: theme.accent }]}>{tag} ×</Text>
      </TagPressable>)}
      {!tags.length ? <Text style={[styles.empty, { color: theme.textMuted }]}>暂无标签</Text> : null}
    </View>
    <View style={styles.inputRow}>
      <TextInput accessibilityLabel="新标签" editable={!disabled} placeholder="输入标签" placeholderTextColor={theme.textMuted}
        value={input} onChangeText={setInput} onSubmitEditing={() => void add()}
        style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
      <TagPressable accessibilityRole="button" accessibilityLabel="打开标签预设" disabled={disabled}
        onPress={() => setPickerVisible(true)} style={[styles.presetButton, { borderColor: theme.accent }]}>
        <Text style={[styles.presetText, { color: theme.accent }]}>预设</Text>
      </TagPressable>
      <TagPressable accessibilityRole="button" accessibilityLabel="添加标签" disabled={disabled}
        onPress={() => void add()} style={[styles.add, { backgroundColor: theme.accent }]}>
        <Text style={styles.addText}>添加</Text>
      </TagPressable>
    </View>
    {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
    <TagPresetSheet visible={pickerVisible} tags={tags} presets={presets} historyTags={historyTags}
      onClose={() => setPickerVisible(false)} onSave={async (values) => {
        if (await commit(values)) setPickerVisible(false);
      }} onPresetsChange={onPresetsChange} />
  </GestureRoot>;
}

function TagPresetSheet({ visible, tags, presets, historyTags, onClose, onSave, onPresetsChange }: {
  visible: boolean;
  tags: string[];
  presets: string[];
  historyTags: string[];
  onClose: () => void;
  onSave: (values: string[]) => Promise<void>;
  onPresetsChange?: (values: string[]) => Promise<unknown>;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string[]>(tags);
  const [draftPresets, setDraftPresets] = useState<string[]>(presets);
  const [presetInput, setPresetInput] = useState('');
  const [message, setMessage] = useState('');
  const presetZone = useRef<View>(null);
  const presetBounds = useRef<LayoutRectangle & { pageY: number }>({ x: 0, y: 0, width: 0, height: 0, pageY: 0 });

  const selectedKeys = useMemo(() => new Set(selected.map((value) => normalizeTagName(value).key)), [selected]);
  const toggle = (tag: string) => setSelected((current) => {
    const key = normalizeTagName(tag).key;
    return current.some((item) => normalizeTagName(item).key === key)
      ? current.filter((item) => normalizeTagName(item).key !== key) : normalizeTags([...current, tag]);
  });
  const persistPresets = async (values: string[]) => {
    try {
      const normalized = normalizeTags(values);
      setDraftPresets(normalized);
      await onPresetsChange?.(normalized);
      setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : '预设保存失败'); }
  };
  const addPreset = async (tag: string) => {
    if (!tag.trim()) { setMessage('请输入预设标签'); return; }
    await persistPresets([...draftPresets, tag]);
    setPresetInput('');
  };
  const copyIfDropped = (tag: string, pageY: number) => {
    const bounds = presetBounds.current;
    if (pageY >= bounds.pageY && pageY <= bounds.pageY + bounds.height) void addPreset(tag);
  };
  const capturePresetBounds = () => presetZone.current?.measureInWindow((x, pageY, width, height) => {
    presetBounds.current = { x, y: 0, width, height, pageY };
  });

  return <AppModal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}
    onShow={() => { setSelected(tags); setDraftPresets(presets); setMessage(''); setTimeout(capturePresetBounds, 0); }}>
    <View style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={[styles.sheetHeader, { borderBottomColor: theme.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="取消标签选择" onPress={onClose}><Text style={{ color: theme.textMuted }}>取消</Text></Pressable>
        <Text style={[styles.sheetTitle, { color: theme.text }]}>标签预设</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="完成标签选择" onPress={() => void onSave(selected)}><Text style={{ color: theme.accent, fontWeight: '800' }}>完成</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.sectionTitle, { color: theme.text }]}>预设标签</Text>
        <Text style={[styles.sectionHint, { color: theme.textMuted }]}>点按选择；可删除或用箭头调整顺序</Text>
        <View ref={presetZone} onLayout={() => setTimeout(capturePresetBounds, 0)}
          style={[styles.presetZone, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {draftPresets.map((tag, index) => <View key={normalizeTagName(tag).key} style={styles.presetRow}>
            <SelectableTag tag={tag} selected={selectedKeys.has(normalizeTagName(tag).key)} onPress={() => toggle(tag)} />
            <Pressable accessibilityLabel={`上移预设 ${tag}`} disabled={index === 0} onPress={() => {
              const next = [...draftPresets]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; void persistPresets(next);
            }}><Text style={{ color: index === 0 ? theme.textMuted : theme.accent }}>↑</Text></Pressable>
            <Pressable accessibilityLabel={`下移预设 ${tag}`} disabled={index === draftPresets.length - 1} onPress={() => {
              const next = [...draftPresets]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; void persistPresets(next);
            }}><Text style={{ color: index === draftPresets.length - 1 ? theme.textMuted : theme.accent }}>↓</Text></Pressable>
            <Pressable accessibilityLabel={`删除预设 ${tag}`} onPress={() => void persistPresets(draftPresets.filter((item) => item !== tag))}><Text style={{ color: theme.danger }}>×</Text></Pressable>
          </View>)}
          {!draftPresets.length ? <Text style={{ color: theme.textMuted }}>暂无预设，可从下方历史拖入</Text> : null}
        </View>
        <View style={styles.inputRow}>
          <TextInput accessibilityLabel="新预设标签" placeholder="新增预设" placeholderTextColor={theme.textMuted}
            value={presetInput} onChangeText={setPresetInput} onSubmitEditing={() => void addPreset(presetInput)}
            style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
          <Pressable accessibilityLabel="添加预设标签" onPress={() => void addPreset(presetInput)} style={[styles.add, { backgroundColor: theme.accent }]}><Text style={styles.addText}>添加</Text></Pressable>
        </View>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>历史标签</Text>
        <Text style={[styles.sectionHint, { color: theme.textMuted }]}>点按选择；拖到上方可复制为预设</Text>
        <View style={styles.historyGrid}>
          {historyTags.map((tag) => <DraggableHistoryTag key={normalizeTagName(tag).key} tag={tag}
            selected={selectedKeys.has(normalizeTagName(tag).key)} onPress={() => toggle(tag)}
            onDrop={(pageY) => copyIfDropped(tag, pageY)} onCopy={() => void addPreset(tag)} />)}
          {!historyTags.length ? <Text style={{ color: theme.textMuted }}>暂无其他歌曲使用过的标签</Text> : null}
        </View>
        {message ? <Text style={{ color: theme.danger }}>{message}</Text> : null}
      </ScrollView>
    </View>
  </AppModal>;
}

function SelectableTag({ tag, selected, onPress }: { tag: string; selected: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={`选择标签 ${tag}`} accessibilityState={{ checked: selected }}
    onPress={onPress} style={[styles.selectableTag, { borderColor: selected ? theme.accent : theme.border, backgroundColor: selected ? theme.accentSoft : theme.surface }]}>
    <Text style={{ color: selected ? theme.accent : theme.textSecondary, fontWeight: '700' }}>{tag}</Text>
  </Pressable>;
}

function DraggableHistoryTag({ tag, selected, onPress, onDrop, onCopy }: {
  tag: string; selected: boolean; onPress: () => void; onDrop: (pageY: number) => void; onCopy: () => void;
}) {
  const offset = useRef(new Animated.ValueXY()).current;
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 8,
    onPanResponderMove: Animated.event([null, { dx: offset.x, dy: offset.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, gesture) => {
      onDrop(gesture.moveY);
      Animated.spring(offset, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(offset, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start(),
  }), [offset, onDrop]);
  const theme = useAppTheme();
  return <View style={styles.historyItem}>
    <Animated.View {...pan.panHandlers} style={{ transform: offset.getTranslateTransform(), zIndex: 10 }}>
      <SelectableTag tag={tag} selected={selected} onPress={onPress} />
    </Animated.View>
    <Pressable accessibilityRole="button" accessibilityLabel={`复制到预设 ${tag}`} onPress={onCopy}>
      <Text style={{ color: theme.accent, fontSize: 11 }}>复制到预设</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 7, marginTop: 9 }, label: { fontSize: 12, fontWeight: '600' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, tag: { borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5 },
  tagText: { fontSize: 11 }, empty: { fontSize: 11 }, inputRow: { flexDirection: 'row', gap: 7 },
  input: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  add: { borderRadius: 8, paddingHorizontal: 13, justifyContent: 'center' }, addText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  presetButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, justifyContent: 'center' }, presetText: { fontWeight: '700', fontSize: 12 },
  error: { fontSize: 11 }, sheet: { flex: 1 }, sheetHeader: { minHeight: 56, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 18, fontWeight: '800' }, sheetContent: { padding: 16, gap: 10 }, sectionTitle: { fontSize: 16, fontWeight: '800', marginTop: 6 }, sectionHint: { fontSize: 12 },
  presetZone: { minHeight: 76, borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 }, presetRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectableTag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 }, historyGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 10 }, historyItem: { alignItems: 'center', gap: 3 },
});

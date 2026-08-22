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

type TagCommitResult = { ok: true } | { ok: false; error: string };

const SheetPressable = Platform.OS === 'android' ? Pressable : GesturePressable;

export function TagEditor({
  tags,
  presets = [],
  historyTags = [],
  presetsEditable = true,
  disabled,
  testID,
  onChange,
  onPresetsChange,
}: {
  tags: string[];
  presets?: string[];
  historyTags?: string[];
  presetsEditable?: boolean;
  disabled?: boolean;
  testID?: string;
  onChange: (tags: string[]) => Promise<unknown>;
  onPresetsChange?: (tags: string[]) => Promise<unknown>;
}) {
  const theme = useAppTheme();
  const GestureRoot = Platform.OS === 'android' ? View : GestureHandlerRootView;
  const TagPressable = Platform.OS === 'android' ? Pressable : GesturePressable;
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);

  const commit = async (values: string[]): Promise<TagCommitResult> => {
    try { setError(''); await onChange(normalizeTags(values)); return { ok: true }; }
    catch {
      const message = '标签保存失败，请重试。';
      setError(message);
      return { ok: false, error: message };
    }
  };

  const add = async () => {
    if (!input.trim()) { setError('请输入标签'); return; }
    if ((await commit([...tags, input])).ok) setInput('');
  };

  return <>
    <GestureRoot testID={testID} style={styles.wrap}>
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
    </GestureRoot>
    <TagPresetSheet visible={pickerVisible} tags={tags} presets={presets} historyTags={historyTags}
      presetsEditable={presetsEditable}
      onClose={() => setPickerVisible(false)} onSave={async (values) => {
        const result = await commit(values);
        if (result.ok) setPickerVisible(false);
        return result;
      }} onPresetsChange={onPresetsChange} />
  </>;
}

function TagPresetSheet({ visible, tags, presets, historyTags, presetsEditable, onClose, onSave, onPresetsChange }: {
  visible: boolean;
  tags: string[];
  presets: string[];
  historyTags: string[];
  presetsEditable: boolean;
  onClose: () => void;
  onSave: (values: string[]) => Promise<TagCommitResult>;
  onPresetsChange?: (values: string[]) => Promise<unknown>;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string[]>(tags);
  const [draftPresets, setDraftPresets] = useState<string[]>(presets);
  const [presetInput, setPresetInput] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const presetZone = useRef<View>(null);
  const presetBounds = useRef<LayoutRectangle & { pageY: number }>({ x: 0, y: 0, width: 0, height: 0, pageY: 0 });

  const selectedKeys = useMemo(() => new Set(selected.map((value) => normalizeTagName(value).key)), [selected]);
  const toggle = (tag: string) => {
    setMessage('');
    setSelected((current) => {
      const key = normalizeTagName(tag).key;
      return current.some((item) => normalizeTagName(item).key === key)
        ? current.filter((item) => normalizeTagName(item).key !== key) : normalizeTags([...current, tag]);
    });
  };
  const persistPresets = async (values: string[]) => {
    try {
      const normalized = normalizeTags(values);
      setDraftPresets(normalized);
      await onPresetsChange?.(normalized);
      setMessage('');
    } catch { setMessage('预设保存失败，请重试。'); }
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
  const saveSelection = async () => {
    if (saving) return;
    setSaving(true);
    const result = await onSave(selected);
    if (!result.ok) setMessage(result.error);
    setSaving(false);
  };

  return <AppModal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}
    onShow={() => {
      setSelected(tags); setDraftPresets(presets); setMessage(''); setSaving(false); setTimeout(capturePresetBounds, 0);
    }}>
    <View testID="tag-preset-sheet" style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View testID="tag-preset-sheet-grabber" style={[styles.sheetGrabber, { backgroundColor: theme.border }]} />
      <View style={styles.sheetHeader}>
        <Text style={[styles.sheetTitle, { color: theme.text }]}>标签预设</Text>
        <SheetPressable accessibilityRole="button" accessibilityLabel="完成标签选择" hitSlop={12}
          accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void saveSelection()}
          style={({ pressed }) => [styles.sheetDoneHit, pressed && styles.softPressed]}>
          <Text style={[styles.sheetDone, { color: theme.accent }]}>{saving ? '保存中…' : '完成'}</Text>
        </SheetPressable>
      </View>
      <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>预设标签</Text>
        <Text style={[styles.sectionHint, { color: theme.textMuted }]}>
          {presetsEditable ? '点按选择；可删除或用箭头调整顺序' : '点按选择'}
        </Text>
        <View ref={presetZone} onLayout={() => setTimeout(capturePresetBounds, 0)}
          testID="tag-preset-list" style={[styles.presetList, { backgroundColor: theme.surface }]}>
          {draftPresets.map((tag, index) => <View key={normalizeTagName(tag).key}
            style={[styles.presetRow, index > 0 && [styles.presetRowBorder, { borderTopColor: theme.border }]]}>
            <SelectableTag tag={tag} selected={selectedKeys.has(normalizeTagName(tag).key)}
              layout="row" onPress={() => toggle(tag)} />
            {presetsEditable ? <>
              <SheetPressable accessibilityRole="button" accessibilityLabel={`上移预设 ${tag}`} disabled={index === 0}
                onPress={() => {
                const next = [...draftPresets]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; void persistPresets(next);
                }} style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.surfaceMuted },
                  index === 0 && styles.disabled, pressed && index > 0 && styles.softPressed]}>
                <Text style={[styles.iconButtonText, { color: index === 0 ? theme.textMuted : theme.accent }]}>↑</Text>
              </SheetPressable>
              <SheetPressable accessibilityRole="button" accessibilityLabel={`下移预设 ${tag}`}
                disabled={index === draftPresets.length - 1} onPress={() => {
                const next = [...draftPresets]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; void persistPresets(next);
                }} style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.surfaceMuted },
                  index === draftPresets.length - 1 && styles.disabled,
                  pressed && index < draftPresets.length - 1 && styles.softPressed]}>
                <Text style={[styles.iconButtonText, {
                  color: index === draftPresets.length - 1 ? theme.textMuted : theme.accent,
                }]}>↓</Text>
              </SheetPressable>
              <SheetPressable accessibilityRole="button" accessibilityLabel={`删除预设 ${tag}`}
                onPress={() => void persistPresets(draftPresets.filter((item) => item !== tag))}
                style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.surfaceMuted },
                  pressed && styles.softPressed]}>
                <Text style={[styles.iconButtonText, { color: theme.danger }]}>×</Text>
              </SheetPressable>
            </> : null}
          </View>)}
          {!draftPresets.length ? <Text style={[styles.presetEmptyText, { color: theme.textMuted }]}>
            {presetsEditable ? '暂无预设，可从下方历史拖入' : '当前谱面暂无可用预设'}
          </Text> : null}
        </View>
        {presetsEditable ? <View style={styles.inputRow}>
          <TextInput accessibilityLabel="新预设标签" placeholder="新增预设" placeholderTextColor={theme.textMuted}
            value={presetInput} onChangeText={setPresetInput} onSubmitEditing={() => void addPreset(presetInput)}
            style={[styles.input, styles.sheetInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
          <SheetPressable accessibilityRole="button" accessibilityLabel="添加预设标签"
            onPress={() => void addPreset(presetInput)}
            style={({ pressed }) => [styles.sheetAdd, { backgroundColor: theme.accent }, pressed && styles.softPressed]}>
            <Text style={styles.sheetAddText}>添加</Text>
          </SheetPressable>
        </View> : null}
        <Text style={[styles.sectionLabel, styles.historyLabel, { color: theme.textMuted }]}>历史标签</Text>
        <Text style={[styles.sectionHint, { color: theme.textMuted }]}>
          {presetsEditable ? '点按选择；拖到上方可复制为预设' : '点按选择'}
        </Text>
        <View style={styles.historyGrid}>
          {historyTags.map((tag) => presetsEditable
            ? <DraggableHistoryTag key={normalizeTagName(tag).key} tag={tag}
                selected={selectedKeys.has(normalizeTagName(tag).key)} onPress={() => toggle(tag)}
                onDrop={(pageY) => copyIfDropped(tag, pageY)} onCopy={() => void addPreset(tag)} />
            : <View key={normalizeTagName(tag).key} style={[styles.historyItem, { backgroundColor: theme.surface }]}>
                <SelectableTag tag={tag} selected={selectedKeys.has(normalizeTagName(tag).key)}
                  onPress={() => toggle(tag)} />
              </View>)}
          {!historyTags.length ? <View style={[styles.historyEmpty, { backgroundColor: theme.surface }]}>
            <Text style={[styles.emptyCardText, { color: theme.textMuted }]}>暂无其他歌曲使用过的标签</Text>
          </View> : null}
        </View>
        {message ? <View testID="tag-preset-message" style={[styles.messageCard, { backgroundColor: theme.surface }]}>
          <Text style={[styles.messageText, { color: theme.danger }]}>{message}</Text>
        </View> : null}
      </ScrollView>
    </View>
  </AppModal>;
}

function SelectableTag({ tag, selected, layout = 'chip', onPress }: {
  tag: string;
  selected: boolean;
  layout?: 'row' | 'chip';
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return <SheetPressable accessibilityRole="checkbox" accessibilityLabel={`选择标签 ${tag}`} accessibilityState={{ checked: selected }}
    onPress={onPress} style={({ pressed }) => [
      layout === 'row' ? styles.rowSelection : styles.chipSelection,
      layout === 'chip' && {
        borderColor: selected ? theme.accent : theme.border,
        backgroundColor: selected ? theme.accentSoft : theme.surface,
      },
      pressed && styles.softPressed,
    ]}>
    <View style={[styles.selectionBox, { borderColor: theme.border, backgroundColor: theme.input },
      selected && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
      {selected ? <Text style={styles.selectionMark}>✓</Text> : null}
    </View>
    <Text style={[layout === 'row' ? styles.rowSelectionText : styles.chipSelectionText,
      { color: selected ? theme.accent : theme.textSecondary }]}>{tag}</Text>
  </SheetPressable>;
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
  return <View style={[styles.historyItem, { backgroundColor: theme.surface }]}>
    <Animated.View {...pan.panHandlers} style={{ transform: offset.getTranslateTransform(), zIndex: 10 }}>
      <SelectableTag tag={tag} selected={selected} onPress={onPress} />
    </Animated.View>
    <SheetPressable accessibilityRole="button" accessibilityLabel={`复制到预设 ${tag}`} onPress={onCopy}
      style={({ pressed }) => [styles.copyButton, pressed && styles.softPressed]}>
      <Text style={[styles.copyText, { color: theme.accent }]}>复制到预设</Text>
    </SheetPressable>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 7, marginTop: 9 }, label: { fontSize: 12, fontWeight: '600' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, tag: { borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5 },
  tagText: { fontSize: 11 }, empty: { fontSize: 11 }, inputRow: { flexDirection: 'row', gap: 7 },
  input: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  add: { borderRadius: 8, paddingHorizontal: 13, justifyContent: 'center' }, addText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  presetButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, justifyContent: 'center' }, presetText: { fontWeight: '700', fontSize: 12 },
  error: { fontSize: 11 },
  sheet: { flex: 1 },
  sheetGrabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  sheetDoneHit: { paddingVertical: 4, paddingHorizontal: 4 },
  sheetDone: { fontSize: 16, fontWeight: '600' },
  softPressed: { opacity: 0.7 },
  disabled: { opacity: 0.55 },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 28, gap: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  sectionHint: { fontSize: 12, lineHeight: 18, marginTop: -6 },
  presetList: { minHeight: 76, borderRadius: 14, overflow: 'hidden' },
  presetRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  presetRowBorder: { borderTopWidth: StyleSheet.hairlineWidth },
  rowSelection: { flex: 1, minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowSelectionText: { flex: 1, fontSize: 15, fontWeight: '600' },
  chipSelection: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipSelectionText: { fontSize: 14, fontWeight: '600' },
  selectionBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionMark: { color: '#FFF', fontSize: 14, fontWeight: '700', lineHeight: 16 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: { fontSize: 17, fontWeight: '700', lineHeight: 20 },
  emptyCardText: { fontSize: 13, lineHeight: 18 },
  presetEmptyText: { padding: 16, fontSize: 13, lineHeight: 18 },
  historyLabel: { marginTop: 8 },
  sheetInput: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
  },
  sheetAdd: {
    minWidth: 72,
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetAddText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  historyGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 10 },
  historyItem: {
    flexGrow: 1,
    flexBasis: 140,
    maxWidth: 240,
    borderRadius: 12,
    padding: 10,
    gap: 4,
  },
  copyButton: { alignSelf: 'flex-end', minHeight: 28, paddingHorizontal: 4, justifyContent: 'center' },
  copyText: { fontSize: 12, fontWeight: '600' },
  historyEmpty: { flex: 1, borderRadius: 12, padding: 16 },
  messageCard: { borderRadius: 12, padding: 14 },
  messageText: { fontSize: 13, lineHeight: 18 },
});

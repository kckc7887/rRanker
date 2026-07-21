import { type ReactNode, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/theme/app-theme';

export type FilterSelectOption<T extends string = string> = {
  value: T;
  label: string;
};

type AnchorLayout = Pick<LayoutRectangle, 'x' | 'y' | 'width' | 'height'>;

const DROPDOWN_GAP = 4;
const DROPDOWN_MAX_HEIGHT = 220;
const OPTION_HEIGHT = 40;
const FALLBACK_TRIGGER: AnchorLayout = { x: 16, y: 120, width: 200, height: 36 };
const FALLBACK_ADORNMENT: AnchorLayout = {
  x: FALLBACK_TRIGGER.x + FALLBACK_TRIGGER.width + 8,
  y: FALLBACK_TRIGGER.y,
  width: 68,
  height: 36,
};

function computeDropdownTop(anchor: AnchorLayout, optionCount: number): number {
  const windowHeight = Dimensions.get('window').height;
  const estimatedHeight = Math.min(DROPDOWN_MAX_HEIGHT, optionCount * OPTION_HEIGHT + 2);
  const spaceBelow = windowHeight - (anchor.y + anchor.height + DROPDOWN_GAP);
  if (spaceBelow >= estimatedHeight || anchor.y < spaceBelow) {
    return anchor.y + anchor.height + DROPDOWN_GAP;
  }
  return Math.max(8, anchor.y - estimatedHeight - DROPDOWN_GAP);
}

export function FilterAnchoredDropdown<T extends string>({
  open,
  onOpenChange,
  valueLabel,
  caption,
  accessibilityLabel,
  options,
  selectedValue,
  onSelect,
  optionAccessibilityPrefix,
  endAdornment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  valueLabel: string;
  caption?: string;
  accessibilityLabel: string;
  options: readonly FilterSelectOption<T>[];
  selectedValue: T;
  onSelect: (value: T) => void;
  optionAccessibilityPrefix: string;
  /** 紧邻触发器的附加控件；下拉展开时会叠在遮罩之上保持可点。 */
  endAdornment?: ReactNode;
}) {
  const theme = useAppTheme();
  const triggerRef = useRef<View>(null);
  const adornmentRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<AnchorLayout | null>(null);
  const [adornmentAnchor, setAdornmentAnchor] = useState<AnchorLayout | null>(null);

  const dropdownTop = useMemo(() => {
    if (!anchor) return 0;
    return computeDropdownTop(anchor, options.length);
  }, [anchor, options.length]);

  const openFromTrigger = () => {
    let measured = false;

    const applyAnchor = (layout: AnchorLayout, adornment: AnchorLayout | null) => {
      setAnchor(layout);
      setAdornmentAnchor(adornment);
      onOpenChange(true);
    };

    const measureAdornment = (triggerLayout: AnchorLayout) => {
      if (!endAdornment || !adornmentRef.current) {
        applyAnchor(triggerLayout, null);
        return;
      }
      adornmentRef.current.measureInWindow((x, y, width, height) => {
        applyAnchor(triggerLayout, { x, y, width, height });
      });
    };

    triggerRef.current?.measureInWindow((x, y, width, height) => {
      measured = true;
      measureAdornment({ x, y, width, height });
    });

    // Jest 等环境不会触发 measureInWindow，仍要渲染 overlay 选项。
    queueMicrotask(() => {
      if (!measured) {
        applyAnchor(FALLBACK_TRIGGER, endAdornment ? FALLBACK_ADORNMENT : null);
      }
    });
  };

  const close = () => onOpenChange(false);

  const onTriggerPress = () => {
    if (open) close();
    else openFromTrigger();
  };

  return (
    <View style={styles.root}>
      <View ref={triggerRef} collapsable={false} style={styles.triggerWrap}>
        <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
          accessibilityState={{ expanded: open }} onPress={onTriggerPress}
          style={[styles.trigger, { backgroundColor: theme.input, borderColor: open ? theme.accent : theme.border }]}>
          {caption ? <Text style={[styles.caption, { color: theme.textMuted }]}>{caption}</Text> : null}
          <View style={styles.valueRow}>
            <Text numberOfLines={1} style={[styles.value, { color: theme.text }]}>{valueLabel}</Text>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={theme.textMuted} />
          </View>
        </Pressable>
      </View>
      {endAdornment ? (
        <View
          ref={adornmentRef}
          collapsable={false}
          pointerEvents={open ? 'none' : 'auto'}
          accessibilityElementsHidden={open}
          importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}
          style={open ? styles.adornmentHidden : undefined}
        >
          {endAdornment}
        </View>
      ) : null}

      <Modal visible={open} transparent animationType="none" onRequestClose={close}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭下拉列表" style={styles.backdrop} onPress={close} />
        {endAdornment && adornmentAnchor ? (
          <View
            pointerEvents="box-none"
            style={[styles.adornmentOverlay, {
              top: adornmentAnchor.y,
              left: adornmentAnchor.x,
              width: adornmentAnchor.width,
              height: Math.max(adornmentAnchor.height, 36),
            }]}
          >
            {endAdornment}
          </View>
        ) : null}
        {anchor ? (
          <View
            pointerEvents="box-none"
            style={[styles.dropdown, {
              top: dropdownTop,
              left: anchor.x,
              width: anchor.width,
              maxHeight: DROPDOWN_MAX_HEIGHT,
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.text,
            }]}
          >
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.list}>
              {options.map((option) => {
                const selected = option.value === selectedValue;
                return (
                  <Pressable key={option.value} accessibilityRole="button"
                    accessibilityLabel={`${optionAccessibilityPrefix} ${option.label}`}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onSelect(option.value);
                      close();
                    }}
                    style={[styles.option, { borderBottomColor: theme.border }, selected && { backgroundColor: theme.accentSoft }]}>
                    <Text style={[styles.optionText, { color: selected ? theme.accent : theme.textSecondary }, selected && styles.optionTextSelected]}>
                      {option.label}
                    </Text>
                    {selected ? <Text style={[styles.check, { color: theme.accent }]}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  triggerWrap: { flex: 1, minWidth: 0 },
  trigger: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
    gap: 2,
  },
  caption: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  value: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '600' },
  adornmentHidden: { opacity: 0 },
  adornmentOverlay: { position: 'absolute', zIndex: 2, justifyContent: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.08)' },
  dropdown: {
    position: 'absolute',
    zIndex: 1,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  list: { maxHeight: DROPDOWN_MAX_HEIGHT },
  option: {
    minHeight: OPTION_HEIGHT,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: { flex: 1, fontSize: 13 },
  optionTextSelected: { fontWeight: '700' },
  check: { fontSize: 13, fontWeight: '900' },
});

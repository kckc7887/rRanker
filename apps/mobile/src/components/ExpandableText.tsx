import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

export function ExpandableText({
  text,
  collapsedLines,
  style,
  expandLabel = '展开',
  collapseLabel = '收起',
}: {
  text: string;
  collapsedLines: number;
  style?: StyleProp<TextStyle>;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const [lineCount, setLineCount] = useState<number | null>(null);

  useEffect(() => {
    setExpanded(false);
    setLineCount(null);
  }, [text, collapsedLines]);

  const canToggle = (lineCount ?? 0) > collapsedLines;

  return (
    <View>
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[style, styles.measure]}
        onTextLayout={(event) => {
          const next = event.nativeEvent.lines.length;
          setLineCount((prev) => (prev === next ? prev : next));
        }}
      >
        {text}
      </Text>
      <Text style={style} numberOfLines={expanded ? undefined : collapsedLines}>
        {text}
      </Text>
      {canToggle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? collapseLabel : expandLabel}
          accessibilityState={{ expanded }}
          hitSlop={8}
          onPress={() => setExpanded((value) => !value)}
          style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
        >
          <Text style={[styles.toggleText, { color: theme.accent }]}>
            {expanded ? collapseLabel : expandLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  measure: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    right: 0,
    zIndex: -1,
  },
  toggle: {
    alignSelf: 'flex-start',
    marginTop: 2,
    minHeight: 24,
    justifyContent: 'center',
  },
  togglePressed: { opacity: 0.62 },
  toggleText: { fontSize: 13, fontWeight: '700' },
});

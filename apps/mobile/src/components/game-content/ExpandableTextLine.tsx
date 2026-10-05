import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { DetailGestureRoot, DetailPressable } from './DetailPressable';

type ExpandableTextLineProps = {
  actionColor: string;
  actionLabel: string;
  actionStyle: StyleProp<ViewStyle>;
  actionTextStyle: StyleProp<TextStyle>;
  blockStyle: StyleProp<ViewStyle>;
  measureStyle: StyleProp<TextStyle>;
  testIDPrefix: string;
  text: string;
  textColor: string;
  textStyle: StyleProp<TextStyle>;
};

export function ExpandableTextLine({
  actionColor,
  actionLabel,
  actionStyle,
  actionTextStyle,
  blockStyle,
  measureStyle,
  testIDPrefix,
  text,
  textColor,
  textStyle,
}: ExpandableTextLineProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    setExpanded(false);
    setOverflow(false);
  }, [text]);
  return (
    <DetailGestureRoot style={blockStyle}>
      <Text
        accessible={false}
        onTextLayout={(event) => setOverflow(event.nativeEvent.lines.length > 1)}
        style={[textStyle, measureStyle, { color: textColor }]}
        testID={`${testIDPrefix}-overflow-measure`}
      >
        {text}
      </Text>
      <Text
        numberOfLines={expanded ? undefined : 1}
        style={[textStyle, { color: textColor }]}
        testID={`${testIDPrefix}-text`}
      >
        {text}
      </Text>
      {overflow ? (
        <DetailPressable
          accessibilityLabel={expanded ? `收起${actionLabel}` : `展开${actionLabel}`}
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => setExpanded((value) => !value)}
          style={actionStyle}
        >
          <Text style={[actionTextStyle, { color: actionColor }]}>{expanded ? '收起' : '展开'}</Text>
        </DetailPressable>
      ) : null}
    </DetailGestureRoot>
  );
}

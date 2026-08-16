import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { DetailGestureRoot, DetailPressable } from './DetailPressable';

/**
 * 单行折叠的可展开文本公共机制（与 SongMetadataTable 的 ExpandableMetadataValue 同源：
 * 隐藏测量 Text + onTextLayout 判定溢出 + expanded 切换 numberOfLines），
 * 差异在于折叠为 1 行，且提供独立的「展开/收起」按钮。
 * 滚动区按压规范：按钮走 DetailPressable，块根走 DetailGestureRoot（iOS 局部手势根）。
 */
type ExpandableTextLineProps = {
  /** 按钮文字颜色（各游戏主题色） */
  actionColor: string;
  /** 无障碍标签后缀，如「别名」→ 展开别名/收起别名 */
  actionLabel: string;
  actionStyle: StyleProp<ViewStyle>;
  actionTextStyle: StyleProp<TextStyle>;
  /** 块根样式（兼作 iOS 局部 GestureHandlerRootView 样式） */
  blockStyle: StyleProp<ViewStyle>;
  /** 隐藏测量 Text 的附加样式（绝对定位 + 透明） */
  measureStyle: StyleProp<TextStyle>;
  testIDPrefix: string;
  text: string;
  textColor: string;
  /** 值文本基础样式 */
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

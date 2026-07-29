import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useState,
} from 'react';
import {
  Platform,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  GestureHandlerRootView,
  Pressable as GesturePressable,
} from 'react-native-gesture-handler';
import { useAppTheme } from '@/theme/app-theme';

export type SongMetadataItem = {
  key: string;
  label: string;
  value: string;
  flex: number;
  accessory?: ReactNode;
  cellStyle?: StyleProp<ViewStyle>;
  rootStyle?: StyleProp<ViewStyle>;
  valueRowStyle?: StyleProp<ViewStyle>;
  valuePressableStyle?: StyleProp<ViewStyle>;
};

type SongMetadataTableProps = {
  accessibilityLabel: string;
  items: readonly SongMetadataItem[];
  style: StyleProp<ViewStyle>;
  cellStyle: StyleProp<ViewStyle>;
  labelStyle: StyleProp<TextStyle>;
  valueStyle: StyleProp<TextStyle>;
  valueBlockStyle: StyleProp<ViewStyle>;
  measureStyle: StyleProp<TextStyle>;
  testIDPrefix: string;
  cellRootStyle?: StyleProp<ViewStyle>;
  interaction?: 'native' | 'platform-detail';
};

function MetadataPressable({
  interaction,
  ...props
}: ComponentProps<typeof Pressable> & {
  interaction: NonNullable<SongMetadataTableProps['interaction']>;
}) {
  return interaction === 'platform-detail' && Platform.OS !== 'android'
    ? <GesturePressable {...props as ComponentProps<typeof GesturePressable>} />
    : <Pressable {...props} />;
}

function MetadataRoot({
  children,
  interaction,
  style,
}: {
  children: ReactNode;
  interaction: NonNullable<SongMetadataTableProps['interaction']>;
  style: StyleProp<ViewStyle>;
}) {
  return interaction === 'platform-detail' && Platform.OS !== 'android'
    ? <GestureHandlerRootView style={style}>{children}</GestureHandlerRootView>
    : <View style={style}>{children}</View>;
}

function ExpandableMetadataValue({
  expanded,
  label,
  measureStyle,
  onOverflowChange,
  testIDPrefix,
  value,
  valueBlockStyle,
  valueStyle,
}: {
  expanded: boolean;
  label: string;
  measureStyle: StyleProp<TextStyle>;
  onOverflowChange: (overflow: boolean) => void;
  testIDPrefix: string;
  value: string;
  valueBlockStyle: StyleProp<ViewStyle>;
  valueStyle: StyleProp<TextStyle>;
}) {
  const theme = useAppTheme();
  return (
    <View style={valueBlockStyle}>
      <Text
        accessible={false}
        onTextLayout={(event) => onOverflowChange(event.nativeEvent.lines.length > 2)}
        style={[valueStyle, measureStyle, { color: theme.text }]}
        testID={`${testIDPrefix}-measure-${label}`}
      >
        {value}
      </Text>
      <Text
        ellipsizeMode="tail"
        numberOfLines={expanded ? undefined : 2}
        style={[valueStyle, { color: theme.text }]}
        testID={`${testIDPrefix}-value-${label}`}
      >
        {value}
      </Text>
    </View>
  );
}

function SongMetadataCell({
  cellRootStyle,
  cellStyle,
  interaction,
  item,
  labelStyle,
  measureStyle,
  testIDPrefix,
  valueBlockStyle,
  valueStyle,
}: Omit<SongMetadataTableProps, 'accessibilityLabel' | 'items' | 'style'> & {
  interaction: NonNullable<SongMetadataTableProps['interaction']>;
  item: SongMetadataItem;
}) {
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    setExpanded(false);
    setOverflow(false);
  }, [item.value]);

  const value = (
    <ExpandableMetadataValue
      expanded={expanded}
      label={item.label}
      measureStyle={measureStyle}
      onOverflowChange={setOverflow}
      testIDPrefix={testIDPrefix}
      value={item.value}
      valueBlockStyle={valueBlockStyle}
      valueStyle={valueStyle}
    />
  );
  const expandableProps = {
    accessibilityLabel: overflow ? `${expanded ? '收起' : '展开'}${item.label}` : undefined,
    accessibilityRole: overflow ? 'button' as const : undefined,
    disabled: !overflow,
    onPress: () => setExpanded((current) => !current),
  };
  const cellContent = item.accessory ? (
    <View style={[cellStyle, item.cellStyle, !cellRootStyle && { flex: item.flex }]}>
      <Text numberOfLines={1} style={[labelStyle, { color: theme.textMuted }]}>{item.label}</Text>
      <View style={item.valueRowStyle}>
        <MetadataPressable
          {...expandableProps}
          interaction={interaction}
          style={item.valuePressableStyle}
        >
          {value}
        </MetadataPressable>
        {item.accessory}
      </View>
    </View>
  ) : (
    <MetadataPressable
      {...expandableProps}
      interaction={interaction}
      style={[cellStyle, item.cellStyle, !cellRootStyle && { flex: item.flex }]}
    >
      <Text numberOfLines={1} style={[labelStyle, { color: theme.textMuted }]}>{item.label}</Text>
      {value}
    </MetadataPressable>
  );

  return cellRootStyle ? (
    <MetadataRoot
      interaction={interaction}
      style={[cellRootStyle, item.rootStyle, { flex: item.flex }]}
    >
      {cellContent}
    </MetadataRoot>
  ) : cellContent;
}

export function SongMetadataTable({
  accessibilityLabel,
  interaction = 'native',
  items,
  style,
  ...cellProps
}: SongMetadataTableProps) {
  const theme = useAppTheme();
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[style, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}
    >
      {items.map((item) => (
        <SongMetadataCell
          {...cellProps}
          interaction={interaction}
          item={item}
          key={item.key}
        />
      ))}
    </View>
  );
}

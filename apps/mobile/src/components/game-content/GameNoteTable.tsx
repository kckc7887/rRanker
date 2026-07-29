import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { NoteGroupPresentation } from '@/features/game-content/presentation';

type GridNoteTableProps = {
  mode: 'grid';
  group: NoteGroupPresentation;
  accessibilityLabel?: string;
  containerStyle: StyleProp<ViewStyle>;
  rowStyle: StyleProp<ViewStyle>;
  headerRowStyle: StyleProp<ViewStyle>;
  headerTextStyle: StyleProp<TextStyle>;
  valueTextStyle: StyleProp<TextStyle>;
};

type CellNoteTableProps = {
  mode: 'cells';
  group: NoteGroupPresentation;
  accessibilityLabel?: string;
  containerStyle: StyleProp<ViewStyle>;
  itemStyle: StyleProp<ViewStyle>;
  labelStyle: StyleProp<TextStyle>;
  valueStyle: StyleProp<TextStyle>;
};

export function GameNoteTable(props: GridNoteTableProps | CellNoteTableProps) {
  if (props.mode === 'cells') {
    return (
      <View accessibilityLabel={props.accessibilityLabel} style={props.containerStyle}>
        {props.group.values.map((note) => (
          <View key={note.key} style={props.itemStyle}>
            <Text style={props.labelStyle}>{note.label}</Text>
            <Text style={props.valueStyle}>{note.value}</Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View accessibilityLabel={props.accessibilityLabel} style={props.containerStyle}>
      <View style={[props.rowStyle, props.headerRowStyle]}>
        {props.group.values.map((note) => (
          <Text key={note.key} numberOfLines={1} style={props.headerTextStyle}>
            {note.label}
          </Text>
        ))}
      </View>
      <View style={props.rowStyle}>
        {props.group.values.map((note) => (
          <Text key={note.key} numberOfLines={1} style={props.valueTextStyle}>
            {note.value}
          </Text>
        ))}
      </View>
    </View>
  );
}

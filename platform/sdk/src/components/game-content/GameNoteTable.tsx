import { useAppTheme } from '@rranker/sdk/theme/app-theme';
import { VERTICAL_SONG_DETAIL_STYLES as styles } from '@rranker/sdk/components/game-content/SongDetailChromeStyles';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { NoteGroupPresentation } from '@rranker/sdk/features/game-content/presentation';

type GridNoteTableProps = {
  mode: 'grid';
  group: NoteGroupPresentation;
  accessibilityLabel?: string;
  containerStyle?: StyleProp<ViewStyle>;
  rowStyle?: StyleProp<ViewStyle>;
  headerRowStyle?: StyleProp<ViewStyle>;
  headerTextStyle?: StyleProp<TextStyle>;
  valueTextStyle?: StyleProp<TextStyle>;
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
  const theme = useAppTheme();
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
    <View accessibilityLabel={props.accessibilityLabel} style={props.containerStyle ?? [styles.notesTable, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
      <View style={[props.rowStyle ?? styles.notesRow, props.headerRowStyle ?? styles.notesHeaderRow]}>
        {props.group.values.map((note) => (
          <Text key={note.key} numberOfLines={1} style={props.headerTextStyle ?? [styles.notesCell, styles.notesHeader, { color: theme.textMuted }]}>
            {note.label}
          </Text>
        ))}
      </View>
      <View style={props.rowStyle ?? styles.notesRow}>
        {props.group.values.map((note) => (
          <Text key={note.key} numberOfLines={1} style={props.valueTextStyle ?? [styles.notesCell, styles.notesValue, { color: theme.text }]}>
            {note.value}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function JudgementTable({ rows, summary, label, testIDPrefix, style, labelColor }: {
  rows: readonly (readonly { key: string; label: string; value: string | number; color: string }[])[];
  summary: { label: string; value: string | number }; label: string; testIDPrefix: string;
  style?: StyleProp<ViewStyle>; labelColor?: string;
}) {
  const theme = useAppTheme();
  return <View accessibilityLabel={label} style={[matrix.panel, style]}>
    <View style={matrix.grid}>{rows.map((row, index) => <View key={index} style={matrix.row}>
      {row.map(cell => <View key={cell.key} testID={`${testIDPrefix}-${cell.key}`} style={matrix.cell}>
        <Text numberOfLines={1} style={[matrix.label, { color: labelColor ?? theme.textMuted }]}>{cell.label}</Text>
        <Text style={[matrix.value, { color: cell.color }]}>{cell.value}</Text>
      </View>)}
    </View>)}</View>
    <View style={[matrix.total, { borderLeftColor: theme.dark ? 'rgba(255,255,255,0.12)' : theme.border }]}>
      <Text style={[matrix.label, { color: labelColor ?? theme.textMuted }]}>{summary.label}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1} style={[matrix.totalValue, { color: theme.text }]}>{summary.value}</Text>
    </View>
  </View>;
}

const matrix = StyleSheet.create({
  panel: {
    minHeight: 104,
    marginTop: 13,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(128,128,128,0.18)',
  },
  grid: { flex: 1, minWidth: 0, gap: 9 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  cell: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 9, lineHeight: 12, fontWeight: '800' },
  value: { fontSize: 18, lineHeight: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  total: { width: 78, flexShrink: 0, borderLeftWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', gap: 5, paddingLeft: 8 },
  totalValue: { width: '100%', fontSize: 21, lineHeight: 27, fontWeight: '900', fontVariant: ['tabular-nums'], textAlign: 'center' },
});

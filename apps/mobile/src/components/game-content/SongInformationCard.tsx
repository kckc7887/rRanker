import { useEffect, useState, type ReactNode } from 'react';
import { Text, type ViewStyle } from 'react-native';
import { Card } from '@/components/Card';
import { useAppTheme } from '@/theme/app-theme';
import { DetailGestureRoot, DetailPressable } from './DetailPressable';
import { VERTICAL_SONG_DETAIL_STYLES as styles } from './SongDetailChromeStyles';

function AliasLine({ aliases, prefix, color }: { aliases: readonly string[]; prefix: string; color: string }) {
  const theme = useAppTheme();
  const text = `别名：${aliases.join('、') || '无'}`;
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    setExpanded(false);
    setOverflow(false);
  }, [text]);
  return <DetailGestureRoot style={styles.aliasBlock}>
    <Text accessible={false} testID={`${prefix}-overflow-measure`}
      onTextLayout={event => setOverflow(event.nativeEvent.lines.length > 1)}
      style={[styles.informationValue, styles.aliasMeasure, { color }]}>{text}</Text>
    <Text numberOfLines={expanded ? undefined : 1} style={[styles.informationValue, { color }]}
      testID={`${prefix}-text`}>{text}</Text>
    {overflow && <DetailPressable accessibilityRole="button" accessibilityLabel={expanded ? '收起别名' : '展开别名'}
      hitSlop={6} onPress={() => setExpanded(value => !value)} style={styles.aliasAction}>
      <Text style={[styles.aliasActionText, { color: theme.accent }]}>{expanded ? '收起' : '展开'}</Text>
    </DetailPressable>}
  </DetailGestureRoot>;
}

type SongInformationCardProps = {
  aliases?: readonly string[];
  aliasPrefix?: string;
  fields?: readonly { label: string; value: string; selectable?: boolean }[];
  children?: ReactNode;
  style?: ViewStyle;
  testID?: string;
  prominent?: boolean;
};

export function SongInformationCard({ aliases = [], aliasPrefix, fields = [], children, style, testID, prominent }: SongInformationCardProps) {
  const theme = useAppTheme();
  const color = prominent ? theme.text : theme.textSecondary;
  return <Card style={style} testID={testID}>
    <Text style={[styles.informationTitle, { color: theme.text }]}>歌曲信息</Text>
    {aliasPrefix && <AliasLine aliases={aliases} prefix={aliasPrefix} color={color} />}
    {children}
    {fields.map(({ label, value, selectable }) => <Text key={label} selectable={selectable}
      style={[styles.informationValue, { color }]}>{label}：{value}</Text>)}
  </Card>;
}

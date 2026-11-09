import type { ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View, type PressableProps, type PressableStateCallbackType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';
import { DetailPressable } from './DetailPressable';
import { VERTICAL_SONG_DETAIL_STYLES as styles } from './SongDetailChromeStyles';

type ChartSummary = {
  difficulty: ReactNode; level: string | number; levelColor?: string; constant?: string;
  label: string; value: ReactNode; badges?: ReactNode;
  metrics: readonly { label?: string; text: string }[]; charter: string;
};

function ChartSummaryView({ summary }: { summary: ChartSummary }) {
  const theme = useAppTheme();
  const { difficulty, levelColor = theme.text, value } = summary;
  return <>
    <View style={styles.chartHeader}>
      {typeof difficulty === 'string' ? <View style={[styles.diffPill, { backgroundColor: levelColor }]}>
        <Text style={styles.diffPillText}>{difficulty}</Text>
      </View> : difficulty}
      <View style={styles.levelBlock}>
        <Text style={[styles.level, { color: levelColor }]}>{summary.level}</Text>
        {summary.constant !== undefined ? <Text style={[styles.constant, { color: theme.textMuted }]}>{summary.constant}</Text> : null}
      </View>
    </View>
    <View style={styles.resultBlock}>
      <Text style={[styles.resultLabel, { color: theme.textMuted }]}>{summary.label}</Text>
      {value ?? <Text accessibilityLabel="未游玩" style={[styles.scoreValue, { color: theme.text }]}>—</Text>}
      {summary.badges ? <View style={styles.badgeRow}>{summary.badges}</View> : null}
    </View>
    <View style={styles.statRow}>{summary.metrics.map(metric => <View key={metric.label} style={styles.statCell}>
      <Text style={[styles.resultLabel, { color: theme.textMuted }]}>{metric.label}</Text>
      <Text style={[styles.statValue, { color: theme.text }]}>{metric.text}</Text>
    </View>)}</View>
    <View style={[styles.chartDivider, { backgroundColor: theme.border }]} />
    <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>谱师：{summary.charter}</Text>
  </>;
}

export function ChartAction({ label, textStyle, native, stack, style, ...props }: PressableProps & {
  label: string; textStyle?: StyleProp<TextStyle>; native?: boolean; stack?: 'first' | 'next';
}) {
  const Button = native ? Pressable : DetailPressable;
  const buttonStyle = stack ? (state: PressableStateCallbackType) => [
    styles.action, stack === 'next' && styles.chartSearchAction, typeof style === 'function' ? style(state) : style,
  ] : style;
  return <Button accessibilityRole="button" accessibilityLabel={label} style={buttonStyle} {...props}>
    <Text style={[styles.actionText, textStyle]}>{label}</Text>
  </Button>;
}

type GameChartResultCardProps = {
  summary?: ChartSummary;
  children: ReactNode;
  style: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  gradient?: {
    colors: readonly [string, string, ...string[]];
    start?: { x: number; y: number };
    end?: { x: number; y: number };
  };
  beforeContent?: ReactNode;
};

export function GameChartResultCard({
  children,
  summary,
  style,
  testID,
  accessibilityLabel,
  gradient,
  beforeContent,
}: GameChartResultCardProps) {
  const body = <>{beforeContent}{summary && <ChartSummaryView summary={summary} />}{children}</>;
  if (gradient) {
    return (
      <LinearGradient
        accessibilityLabel={accessibilityLabel}
        colors={gradient.colors}
        end={gradient.end}
        start={gradient.start}
        style={style}
        testID={testID}
      >
        {body}
      </LinearGradient>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel} style={style} testID={testID}>
      {body}
    </View>
  );
}

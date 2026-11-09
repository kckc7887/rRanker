import { type ReactNode } from 'react';
import { FlatList, StyleSheet, Text, View, type FlatListProps } from 'react-native';
import { AppSheet } from '@/components/AppSheet';
import { Card } from '@/components/Card';
import { useAppTheme } from '@/theme/app-theme';
import { ScoreCardArtworkScope } from './GameScoreCard';

export function StrengthConclusion({ title, children }: { title: string; children: ReactNode }) {
  const theme = useAppTheme();
  return <Card style={styles.card}>
    <Text style={[styles.title, styles.center, { color: theme.text }]}>{title}</Text>
    {children}
  </Card>;
}

export function StrengthPractice({ title, children }: { title: string; children: ReactNode }) {
  const theme = useAppTheme();
  return <ScoreCardArtworkScope><View style={styles.practice}>
    <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
    {children}
  </View></ScoreCardArtworkScope>;
}

export function StrengthSongsSheet<T>({ visible, title, onClose, closeLabel, testID, data, ...list }: {
  visible: boolean;
  title: string;
  onClose: () => void;
  closeLabel?: string;
  testID?: string;
} & Pick<FlatListProps<T>, 'data' | 'keyExtractor' | 'renderItem' | 'ListEmptyComponent'>) {
  return <AppSheet visible={visible} title={title} testID={testID} onRequestClose={onClose}
    rightAction={{ label: '完成', onPress: onClose, accessibilityLabel: closeLabel }}>
    <ScoreCardArtworkScope>
      <FlatList {...list} data={data} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} />
    </ScoreCardArtworkScope>
  </AppSheet>;
}

const styles = StyleSheet.create({
  card: { paddingBottom: 8, gap: 2 },
  title: { fontSize: 17, lineHeight: 23, fontWeight: '800' },
  center: { textAlign: 'center' },
  practice: { gap: 10 },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28, gap: 10 },
});

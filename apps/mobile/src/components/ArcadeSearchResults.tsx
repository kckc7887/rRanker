import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { formatArcadeAddress, type ArcadeShop } from '@/domain/arcade-shops';
import type { ArcadePlace } from '@/services/arcade-place-search';
import type { useArcadeSearch } from '@/hooks/use-arcade-search';
import { useAppTheme } from '@/theme/app-theme';

type Candidate = { kind: 'shop'; value: ArcadeShop } | { kind: 'place'; value: ArcadePlace };

export function ArcadeSearchResults({ search, onSelectShop, onSelectPlace }: {
  search: ReturnType<typeof useArcadeSearch>;
  onSelectShop: (shop: ArcadeShop) => void;
  onSelectPlace: (place: ArcadePlace) => void;
}) {
  const theme = useAppTheme();
  const sections = [
    { title: '地点', kind: 'place', result: search.places, data: search.places.items.map(value => ({ kind: 'place', value }) as Candidate) },
    { title: '机厅', kind: 'shop', result: search.shops, data: search.shops.items.map(value => ({ kind: 'shop', value }) as Candidate) },
  ];
  return <SectionList sections={sections} keyExtractor={item => `${item.kind}:${item.value.id}`}
    keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} stickySectionHeadersEnabled={false}
    renderSectionHeader={({ section }) => <Text style={[styles.heading, { color: theme.text }]}>{section.title}</Text>}
    renderItem={({ item }) => <Pressable style={[styles.row, { borderColor: theme.border }]}
      onPress={() => item.kind === 'shop' ? onSelectShop(item.value) : onSelectPlace(item.value)}>
      <Text numberOfLines={2} style={[styles.name, { color: theme.text }]}>{item.value.name}</Text>
      <Text numberOfLines={2} style={[styles.address, { color: theme.textMuted }]}>
        {item.kind === 'shop' ? formatArcadeAddress(item.value) : item.value.address}
      </Text>
    </Pressable>}
    renderSectionFooter={({ section }) => <View style={styles.footer}>
      {section.result.loading ? <ActivityIndicator color={theme.accent} /> : null}
      {section.result.error ? <>
        <Text style={{ color: theme.textMuted }}>{section.result.error}</Text>
        <Pressable onPress={section.kind === 'shop' ? search.retryShops : search.retryPlaces} style={styles.action}>
          <Text style={{ color: theme.accent }}>{section.kind === 'shop' ? '重试机厅搜索' : '重试地点搜索'}</Text>
        </Pressable>
      </> : !section.result.loading && section.data.length === 0 ? <Text style={{ color: theme.textMuted }}>没有找到{section.title}</Text> : null}
      {section.kind === 'shop' && search.shops.hasMore && !search.shops.loading && !search.shops.error ?
        <Pressable onPress={() => { void search.loadMore(); }} style={styles.action}><Text style={{ color: theme.accent }}>继续加载机厅</Text></Pressable> : null}
    </View>} />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 28 },
  heading: { fontSize: 14, fontWeight: '700', paddingTop: 12, paddingBottom: 6 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  name: { fontSize: 15, fontWeight: '600' },
  address: { fontSize: 12, lineHeight: 18 },
  footer: { paddingVertical: 10, gap: 8 },
  action: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
});

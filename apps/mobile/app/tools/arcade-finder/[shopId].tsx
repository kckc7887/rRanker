import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useNotification } from '@/components/AppNotification';
import { ArcadeBusinessStatusLabel } from '@/components/ArcadeBusinessStatusLabel';
import { Card } from '@/components/Card';
import { ExpandableText } from '@/components/ExpandableText';
import {
  formatArcadeAddress,
  formatArcadeOpeningHoursLines,
  type ArcadeShopDetail,
} from '@/domain/arcade-shops';
import { fetchNearcadeShop } from '@/services/nearcade-client';
import { useAppTheme } from '@/theme/app-theme';
import { openArcadeNavigation } from '@/utils/open-arcade-navigation';

export default function ArcadeShopDetailScreen() {
  const theme = useAppTheme();
  const { showActionNotification, showNotification } = useNotification();
  const { shopId: shopIdParam } = useLocalSearchParams<{ shopId?: string }>();
  const shopId = Number(shopIdParam);
  const [shop, setShop] = useState<ArcadeShopDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(shopId) || shopId <= 0) {
      setShop(null);
      setIsError(true);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setIsError(false);
    try {
      const next = await fetchNearcadeShop(shopId);
      setShop(next);
    } catch {
      setShop(null);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = shop?.name ?? '机厅详情';
  const openingLines = shop ? formatArcadeOpeningHoursLines(shop.openingHours) : [];

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title }} />
      {isLoading && !shop ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.statusText, { color: theme.textMuted }]}>正在加载机厅详情…</Text>
        </View>
      ) : isError || !shop ? (
        <View style={styles.center}>
          <Text style={[styles.statusText, { color: theme.textMuted }]}>机厅详情加载失败</Text>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.accent }]}
            onPress={() => { void load(); }}
          >
            <Text style={styles.primaryButtonText}>重试</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.section}>
            <Text style={[styles.shopName, { color: theme.text }]}>{shop.name}</Text>
            <Text style={[styles.metaLabel, { color: theme.textMuted }]}>地址</Text>
            <Text style={[styles.metaValue, { color: theme.textSecondary }]}>
              {formatArcadeAddress(shop) || '地址未知'}
            </Text>
            {shop.comment.trim() ? (
              <>
                <Text style={[styles.metaLabel, { color: theme.textMuted }]}>备注</Text>
                <ExpandableText
                  text={shop.comment}
                  collapsedLines={4}
                  style={[styles.metaValue, { color: theme.textSecondary }]}
                />
              </>
            ) : null}
            <Text style={[styles.metaLabel, { color: theme.textMuted }]}>营业状态</Text>
            <ArcadeBusinessStatusLabel openingHours={shop.openingHours} />
            <Text style={[styles.metaLabel, { color: theme.textMuted }]}>营业时间</Text>
            {openingLines.map((line) => (
              <Text key={line} style={[styles.metaValue, { color: theme.textSecondary }]}>{line}</Text>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`导航到${shop.name}`}
              onPress={() => openArcadeNavigation(shop, { showActionNotification, showNotification })}
              style={[styles.primaryButton, { backgroundColor: theme.accent, alignSelf: 'flex-start' }]}
            >
              <Text style={styles.primaryButtonText}>导航</Text>
            </Pressable>
          </Card>

          <Card style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>机台</Text>
            {shop.games.length === 0 ? (
              <Text style={[styles.metaValue, { color: theme.textMuted }]}>暂无机台信息</Text>
            ) : (
              shop.games.map((game) => (
                <View
                  key={`${game.gameId}-${game.titleId}-${game.name}`}
                  style={[styles.gameRow, { borderTopColor: theme.border }]}
                >
                  <Text style={[styles.gameName, { color: theme.text }]}>
                    {game.name}
                    {game.quantity > 0 ? ` ×${game.quantity}` : ''}
                  </Text>
                  {game.version.trim() ? (
                    <Text style={[styles.gameMeta, { color: theme.textMuted }]}>版本 {game.version}</Text>
                  ) : null}
                  {game.cost.trim() ? (
                    <Text style={[styles.gameMeta, { color: theme.textMuted }]}>价格 {game.cost}</Text>
                  ) : null}
                  {game.comment.trim() ? (
                    <ExpandableText
                      text={game.comment}
                      collapsedLines={2}
                      style={[styles.gameMeta, { color: theme.textSecondary }]}
                    />
                  ) : null}
                </View>
              ))
            )}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  section: { gap: 8 },
  shopName: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  metaLabel: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  metaValue: { fontSize: 14, lineHeight: 20 },
  gameRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 6,
    gap: 3,
  },
  gameName: { fontSize: 15, fontWeight: '700' },
  gameMeta: { fontSize: 13, lineHeight: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  statusText: { fontSize: 14, textAlign: 'center' },
  primaryButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 8,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});

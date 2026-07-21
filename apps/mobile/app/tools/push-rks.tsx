import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { EmptyDataView } from '@/components/EmptyDataView';
import { FormField } from '@/components/FormField';
import { PhigrosScoreCard } from '@/components/phigros/PhigrosScoreCard';
import type { PushRecommendationsResult } from '@/domain/phigros-push';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

function parseNumericInput(value: string): number {
  const normalized = value.normalize('NFKC').trim().replace(',', '.');
  return normalized ? Number(normalized) : Number.NaN;
}

function parseDelta(value: string): number | null {
  const n = parseNumericInput(value);
  if (!Number.isFinite(n) || n < 0.01) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded < 0.01) return null;
  return rounded;
}

function parseSongCost(value: string): number | null {
  const n = parseNumericInput(value);
  if (!Number.isInteger(n) || n < 1 || n > 30) return null;
  return n;
}

export default function PushRksToolScreen() {
  const theme = useAppTheme();
  const session = useSession((s) => s.session);
  const scoreProvider = useSession((s) => s.scoreProvider);
  const catalogQuery = usePhigrosCatalog();
  const [deltaText, setDeltaText] = useState('0.01');
  const [songCostText, setSongCostText] = useState('1');
  const [includePhi, setIncludePhi] = useState(true);

  const delta = parseDelta(deltaText);
  const songCost = parseSongCost(songCostText);
  const deltaError = delta == null ? '加值至少为 0.01，且最多两位小数。' : null;
  const songCostError = songCost == null ? '成本须为 1–30 的整数（愿意打几首歌）。' : null;
  const hasPhiSession = session?.mode === 'phi-session'
    && scoreProvider instanceof PhigrosScoreProvider;
  const inputsValid = delta != null && songCost != null;

  const titleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const song of catalogQuery.data?.snapshot.songs ?? []) {
      map.set(song.id, song.title);
    }
    return map;
  }, [catalogQuery.data?.snapshot.songs]);

  const pushQuery = useQuery({
    queryKey: ['phigros-push-rks', delta, songCost, includePhi, session?.mode],
    enabled: hasPhiSession && inputsValid,
    queryFn: async (): Promise<PushRecommendationsResult> => {
      if (!(scoreProvider instanceof PhigrosScoreProvider) || delta == null || songCost == null) {
        throw new Error('Phigros 存档未就绪');
      }
      return scoreProvider.getPushRecommendations(delta, songCost, includePhi);
    },
  });

  if (!hasPhiSession) {
    return (
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '推分计算' }} />
        <EmptyDataView
          title="尚未绑定 TapTap"
          detail="请在游戏管理中绑定 Phigros 的 TapTap 云存档后再使用推分计算。"
        />
      </View>
    );
  }

  const result = pushQuery.data;
  const showLoading = inputsValid && pushQuery.isLoading && !result;
  const showError = inputsValid && pushQuery.isError && !result;

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: '推分计算' }} />
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        data={result?.recommendations ?? []}
        keyExtractor={(item) => `${item.songId}-${item.level}`}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Card>
              <View style={styles.row}>
                <FormField label="期望加值" value={deltaText} onChangeText={setDeltaText} placeholder="0.01" />
                <FormField
                  label="期望成本（首歌）"
                  value={songCostText}
                  onChangeText={setSongCostText}
                  placeholder="1"
                />
              </View>
              {deltaError ? <Text style={[styles.error, { color: theme.danger }]}>{deltaError}</Text> : null}
              {songCostError ? <Text style={[styles.error, { color: theme.danger }]}>{songCostError}</Text> : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: includePhi }}
                accessibilityLabel={includePhi ? '包含目标 Acc 100% 的 φ 推分' : '排除目标 Acc 100% 的 φ 推分'}
                onPress={() => setIncludePhi((v) => !v)}
                style={[
                  styles.toggleRow,
                  {
                    borderColor: includePhi ? theme.accent : theme.border,
                    backgroundColor: includePhi ? theme.accentSoft : theme.input,
                  },
                ]}
              >
                <View style={styles.toggleTextCol}>
                  <Text style={[styles.toggleTitle, { color: theme.text }]}>包含 φ</Text>
                  <Text style={[styles.toggleHint, { color: theme.textMuted }]}>
                    目标 Acc 为 100% 的谱面
                  </Text>
                </View>
                <Text style={[styles.toggleState, { color: includePhi ? theme.accent : theme.textMuted }]}>
                  {includePhi ? '开' : '关'}
                </Text>
              </Pressable>

              {result ? (
                <>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>
                    当前精确 RKS {result.currentRks.toFixed(4)}
                    （显示 {result.displayRks.toFixed(2)}）
                  </Text>
                  <Text style={[styles.resultLine, { color: theme.text }]}>
                    期望精确 RKS {result.exactTarget.toFixed(4)}
                  </Text>
                  <Text style={[styles.meta, { color: theme.textSecondary }]}>
                    期望显示 RKS {result.displayTarget.toFixed(2)}
                  </Text>
                  <Text style={[styles.meta, { color: theme.textSecondary }]}>
                    精确加值 {result.gainNeeded.toFixed(4)}
                    {' · '}
                    分摊 {result.songCost} 首
                    {' · '}
                    每首承担 {result.perSongShare.toFixed(4)}
                  </Text>
                </>
              ) : null}
            </Card>

            {showLoading ? (
              <View style={styles.statusBlock}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : null}

            {showError ? (
              <View style={styles.statusBlock}>
                <Text style={[styles.statusText, { color: theme.textMuted }]}>计算失败，请重试</Text>
                <Pressable
                  style={[styles.retryButton, { backgroundColor: theme.accent }]}
                  onPress={() => void pushQuery.refetch()}
                >
                  <Text style={styles.retryText}>重试</Text>
                </Pressable>
              </View>
            ) : null}

            {result ? (
              <>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  按 Acc 差值推荐（{result.recommendations.length}）
                </Text>
                {result.recommendations.length === 0 ? (
                  <Text style={[styles.emptyHint, { color: theme.textMuted }]}>
                    没有谱面能承担每首 {result.perSongShare.toFixed(4)} 的份额
                    {result.includePhi ? '' : '（已排除 φ）'}
                    ，可增加成本歌数、降低加值
                    {result.includePhi ? '' : '或开启包含 φ'}
                    。
                  </Text>
                ) : null}
                {result.recommendations.length > 0
                  && result.recommendations.length < result.songCost ? (
                  <Text style={[styles.warnHint, { color: theme.warning }]}>
                    仅有 {result.recommendations.length} 张谱面可达每首份额，少于期望成本 {result.songCost} 首；均摊可能无法凑满期望 RKS，可增加成本歌数或降低加值。
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
        )}
        renderItem={({ item, index }) => (
          <PhigrosScoreCard
            record={item.record}
            catalogTitle={titleMap.get(item.songId) ?? item.songId}
            rank={index + 1}
            pushHint={{
              currentAcc: item.currentAcc,
              targetAcc: item.targetAcc,
              accDiff: item.accDiff,
            }}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  list: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 28 },
  header: { gap: 12, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 10 },
  toggleRow: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleTextCol: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: 14, fontWeight: '700' },
  toggleHint: { fontSize: 12, lineHeight: 16 },
  toggleState: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 13, marginTop: 8, lineHeight: 18 },
  resultLine: { fontSize: 18, fontWeight: '700', marginTop: 6 },
  error: { marginTop: 8, fontSize: 13 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  emptyHint: { fontSize: 13, lineHeight: 19 },
  warnHint: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  statusBlock: { alignItems: 'center', paddingVertical: 20, gap: 10 },
  statusText: { fontSize: 14 },
  retryButton: {
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});

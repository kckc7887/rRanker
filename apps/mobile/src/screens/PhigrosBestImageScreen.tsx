import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, PixelRatio, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';
import { useNotification } from '@/components/AppNotification';
import { formatPhigrosChallengeBadge } from '@/domain/phigros-challenge-theme';
import { loadPhigrosAvatarCatalog } from '@/domain/phigros-avatar-resolver';
import type { Song } from '@/domain/models';
import {
  parseBestImageHeightMessage, parseBestImageReadyMessage,
} from '@/features/best-image/build-best-image-html';
import {
  bestImageCaptureDimensions, bestImageExportFilename, deleteBestImageCapture,
  isDrawViewHierarchyError, requestBestImageExportPermission, saveBestImageCapture,
  shouldUseBestImageRenderInContext,
} from '@/features/best-image/best-image-export';
import {
  inlineBestImageWebViewSources, prepareAndroidBestImageWebViewSources,
  type BestImageWebViewSource,
} from '@/features/best-image/prepare-best-image-webview-sources';
import { buildPhigrosBestImageHtml } from '@/features/phigros-best-image/build-phigros-best-image-html';
import {
  buildPhigrosCustomRecords, DEFAULT_PHIGROS_BEST_IMAGE_FILTERS,
  paginatePhigrosBestImageSections, parseOptionalRangeNumber, parsePhigrosImageQuantity,
  type PhigrosBestImageDifficulty, type PhigrosBestImageFilters,
  type PhigrosBestImageRate, type PhigrosBestImageType,
} from '@/features/phigros-best-image/phigros-best-image';
import {
  loadPhigrosIllustrations, loadRemoteImageDataUri,
} from '@/features/phigros-best-image/load-phigros-image-assets';
import {
  phigrosBestImagePreferencesStore, type PhigrosBestImageStylePreferences,
  type PhigrosImageStyleChoice,
} from '@/features/phigros-best-image/phigros-best-image-preferences';
import { useGameData } from '@/hooks/use-game-data';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { useAppTheme } from '@/theme/app-theme';

const WIDTHS = [1080, 1440, 2160] as const;
const LEVELS = ['EZ', 'HD', 'IN', 'AT'] as const;
const RATES: readonly PhigrosBestImageRate[] = ['phi', 'v', 's', 'a', 'b', 'c', 'f'];
const DEFAULT_STYLES: PhigrosBestImageStylePreferences = {
  version: 1, avatar: { mode: 'current' }, background: { mode: 'current' },
};

type StyleKind = 'avatar' | 'background';
type PickerItem = { key: string; label: string };

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={label}
    onPress={onPress} style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }, selected && { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
    <Text style={[styles.chipText, { color: selected ? theme.accent : theme.textSecondary }]}>{label}</Text>
  </Pressable>;
}

function formatSyncTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知' : date.toLocaleString('zh-CN', { hour12: false });
}

function resolvedRandom<T>(items: readonly T[], seed: string): T | undefined {
  if (!items.length) return undefined;
  let hash = 0;
  for (const character of seed) hash = ((hash * 31) + character.charCodeAt(0)) | 0;
  return items[Math.abs(hash) % items.length];
}

export function PhigrosBestImageScreen() {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const gameData = useGameData();
  const catalog = usePhigrosCatalog();
  const window = useWindowDimensions();
  const payload = gameData.data?.payload.kind === 'phigros' ? gameData.data.payload : null;
  const provider = catalog.data?.provider;
  const songs = useMemo(() => catalog.data?.snapshot.songs ?? [], [catalog.data?.snapshot.songs]);
  const [type, setType] = useState<PhigrosBestImageType>('best30');
  const [width, setWidth] = useState<(typeof WIDTHS)[number]>(1080);
  const [quantity, setQuantity] = useState('30');
  const [difficulties, setDifficulties] = useState<PhigrosBestImageDifficulty[]>([0, 1, 2, 3]);
  const [minConstant, setMinConstant] = useState(''); const [maxConstant, setMaxConstant] = useState('');
  const [minAcc, setMinAcc] = useState(''); const [maxAcc, setMaxAcc] = useState('');
  const [rates, setRates] = useState<PhigrosBestImageRate[]>([]); const [fcOnly, setFcOnly] = useState(false);
  const [stylePrefs, setStylePrefs] = useState(DEFAULT_STYLES); const [prefsReady, setPrefsReady] = useState(false);
  const [avatarItems, setAvatarItems] = useState<string[]>([]); const [picker, setPicker] = useState<StyleKind | null>(null);
  const [illustrations, setIllustrations] = useState<Record<string, string | null> | null>(null);
  const [avatarData, setAvatarData] = useState<string | null>(null); const [backgroundData, setBackgroundData] = useState<string | null>(null);
  const [assetProgress, setAssetProgress] = useState({ done: 0, total: 0 });
  const [sources, setSources] = useState<BestImageWebViewSource[] | null>(null);
  const [pageHeights, setPageHeights] = useState<Record<string, number>>({}); const [pageIndex, setPageIndex] = useState(0);
  const [exportIndex, setExportIndex] = useState<number | null>(null); const [exportHeight, setExportHeight] = useState(810);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const exportCaptureRef = useRef<View>(null); const exportResolve = useRef<((height: number) => void) | null>(null);
  const exportReject = useRef<((error: Error) => void) | null>(null); const exportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPrefsReady(false);
    void phigrosBestImagePreferencesStore.load(gameData.activeAccountId).then((value) => { setStylePrefs(value); setPrefsReady(true); });
  }, [gameData.activeAccountId]);
  useEffect(() => { if (prefsReady) void phigrosBestImagePreferencesStore.save(gameData.activeAccountId, stylePrefs); }, [gameData.activeAccountId, prefsReady, stylePrefs]);
  useEffect(() => { if (provider) void provider.getGameVersion().then(loadPhigrosAvatarCatalog).then(setAvatarItems).catch(() => setAvatarItems([])); }, [provider]);

  const parsedFilters = useMemo<PhigrosBestImageFilters | null>(() => {
    const parsedQuantity = parsePhigrosImageQuantity(quantity);
    const values = [
      parseOptionalRangeNumber(minConstant, 0, 20), parseOptionalRangeNumber(maxConstant, 0, 20),
      parseOptionalRangeNumber(minAcc, 0, 100), parseOptionalRangeNumber(maxAcc, 0, 100),
    ];
    if (parsedQuantity == null || values.includes(undefined) || difficulties.length === 0) return null;
    const [minC, maxC, minA, maxA] = values as (number | null)[];
    if ((minC != null && maxC != null && minC > maxC) || (minA != null && maxA != null && minA > maxA)) return null;
    return { ...DEFAULT_PHIGROS_BEST_IMAGE_FILTERS, quantity: parsedQuantity, difficulties, minConstant: minC, maxConstant: maxC, minAcc: minA, maxAcc: maxA, rates, fcOnly };
  }, [difficulties, fcOnly, maxAcc, maxConstant, minAcc, minConstant, quantity, rates]);

  const sections = useMemo(() => {
    if (!payload) return [];
    if (type === 'best30') return payload.bestSections.map((section) => ({ ...section, records: [...section.records] }));
    return [{ id: 'custom', title: '自定义', records: parsedFilters ? buildPhigrosCustomRecords(payload.records, parsedFilters) : [] }];
  }, [parsedFilters, payload, type]);
  const pages = useMemo(() => paginatePhigrosBestImageSections(sections), [sections]);
  const selectedSongIds = useMemo(() => sections.flatMap((section) => section.records.map((record) => record.songId)), [sections]);
  const selectedSongKey = selectedSongIds.join('|');

  const selectStyleKey = (kind: StyleKind, choice: PhigrosImageStyleChoice): string | null => {
    const available = kind === 'avatar' ? avatarItems : songs.map((song) => song.id);
    if (choice.mode === 'off') return null;
    if (choice.mode === 'item') return choice.key ?? null;
    if (choice.mode === 'random') return choice.key ?? resolvedRandom(available, `${gameData.activeAccountId}:${kind}`) ?? null;
    if (kind === 'avatar') return payload?.avatarKey ?? null;
    return payload?.backgroundSongId ?? selectedSongIds[0] ?? null;
  };
  const avatarKey = selectStyleKey('avatar', stylePrefs.avatar);
  const backgroundKey = selectStyleKey('background', stylePrefs.background);

  useEffect(() => {
    let cancelled = false;
    setIllustrations(null); setAssetProgress({ done: 0, total: selectedSongIds.length });
    if (!provider) return;
    void Promise.all([
      loadPhigrosIllustrations(selectedSongIds, (id) => provider.getIllustrationUrl(id), (done, total) => !cancelled && setAssetProgress({ done, total })),
      stylePrefs.avatar.mode === 'off' ? Promise.resolve(null) : (async () => (
        await loadRemoteImageDataUri(avatarKey ? provider.getAvatarUrl(avatarKey) : payload?.avatarUrl)
        ?? await loadRemoteImageDataUri(payload?.avatarUrl)
      ))(),
      stylePrefs.background.mode === 'off' ? Promise.resolve(null) : (async () => (
        await loadRemoteImageDataUri(backgroundKey ? provider.getIllustrationBlurUrl(backgroundKey) : null)
        ?? await loadRemoteImageDataUri(selectedSongIds[0] ? provider.getIllustrationBlurUrl(selectedSongIds[0]) : null)
      ))(),
    ]).then(([nextIllustrations, nextAvatar, nextBackground]) => {
      if (!cancelled) { setIllustrations(nextIllustrations); setAvatarData(nextAvatar ?? null); setBackgroundData(nextBackground ?? null); }
    });
    return () => { cancelled = true; };
  }, [avatarKey, backgroundKey, payload?.avatarUrl, provider, selectedSongIds, selectedSongKey, stylePrefs.avatar.mode, stylePrefs.background.mode]);

  const titles = useMemo(() => Object.fromEntries(songs.map((song) => [song.id, song.title])), [songs]);
  const htmlPages = useMemo(() => payload && illustrations ? pages.map((page) => buildPhigrosBestImageHtml({
    type, width, page, playerName: payload.player.displayName, rks: payload.playerScore.display,
    challenge: formatPhigrosChallengeBadge(payload.challengeModeRank), syncedAt: formatSyncTime(payload.source.updatedAt),
    progress: payload.progress, titles, illustrations, avatarDataUri: avatarData, backgroundDataUri: backgroundData,
  })) : null, [avatarData, backgroundData, illustrations, pages, payload, titles, type, width]);

  useEffect(() => {
    setSources(null); setPageHeights({}); setPageIndex(0);
    if (!htmlPages) return;
    if (Platform.OS !== 'android') { setSources(inlineBestImageWebViewSources(htmlPages)); return; }
    const prepared = prepareAndroidBestImageWebViewSources(htmlPages); setSources(prepared.sources); return prepared.dispose;
  }, [htmlPages]);

  const currentPage = pages[Math.min(pageIndex, pages.length - 1)]!;
  const outputHeight = pageHeights[currentPage.id] ?? Math.ceil(width * .75);
  const previewWidth = Math.min(720, Math.max(280, window.width - 32)); const previewHeight = previewWidth * .75;
  const pickerItems: PickerItem[] = picker === 'avatar'
    ? avatarItems.map((key) => ({ key, label: key }))
    : songs.map((song: Song) => ({ key: song.id, label: song.title }));

  const chooseStyle = (choice: PhigrosImageStyleChoice) => {
    const kind = picker; if (!kind) return;
    const available = kind === 'avatar' ? avatarItems : songs.map((song) => song.id);
    const resolved = choice.mode === 'random' ? { mode: 'random' as const, key: resolvedRandom(available, `${gameData.activeAccountId}:${kind}:${Date.now()}`) } : choice;
    setStylePrefs((current) => ({ ...current, [kind]: resolved })); setPicker(null);
  };
  const waitForExport = (index: number) => new Promise<number>((resolve, reject) => {
    exportResolve.current = resolve; exportReject.current = reject; setExportHeight(pageHeights[pages[index]!.id] ?? Math.ceil(width * .75)); setExportIndex(index);
    exportTimer.current = setTimeout(() => reject(new Error('图片渲染超时')), 30_000);
  });
  const handleExportMessage = (value: string) => {
    const measured = parseBestImageHeightMessage(value, width); if (measured != null) setExportHeight(measured);
    const ready = parseBestImageReadyMessage(value, width); if (ready == null || !exportResolve.current) return;
    const resolve = exportResolve.current; exportResolve.current = null; if (exportTimer.current) clearTimeout(exportTimer.current); setTimeout(() => resolve(ready), 320);
  };
  const exportImages = async () => {
    if (!payload || !sources || !htmlPages || exportStatus) return;
    const captures: { uri: string; filename: string }[] = [];
    try {
      await requestBestImageExportPermission();
      for (let index = 0; index < sources.length; index += 1) {
        setExportStatus(`正在导出 ${index + 1}/${sources.length}`); const height = await waitForExport(index);
        const dimensions = bestImageCaptureDimensions(width, height, PixelRatio.get(), Platform.OS);
        const useRenderInContext = shouldUseBestImageRenderInContext(Platform.OS, width, height);
        const options = { format: 'png', quality: 1, result: 'tmpfile', ...dimensions, ...(useRenderInContext ? { useRenderInContext: true } : {}) } as const;
        let uri: string;
        try { uri = await captureRef(exportCaptureRef, options); }
        catch (error) { if (Platform.OS !== 'ios' || useRenderInContext || !isDrawViewHierarchyError(error)) throw error; uri = await captureRef(exportCaptureRef, { ...options, useRenderInContext: true }); }
        captures.push({ uri, filename: bestImageExportFilename(payload.player.displayName, type, index, sources.length) });
      }
      setExportIndex(null);
      for (const [index, capture] of captures.entries()) { setExportStatus(`正在保存 ${index + 1}/${captures.length}`); await saveBestImageCapture(capture.uri, capture.filename); }
      showNotification({ title: '导出完成', message: `已保存 ${captures.length} 张成绩图片到相册`, variant: 'success' });
    } catch (error) { showNotification({ title: '导出失败', message: error instanceof Error ? error.message : '无法导出成绩图片', variant: 'error' }); }
    finally { if (exportTimer.current) clearTimeout(exportTimer.current); exportResolve.current = null; exportReject.current = null; setExportIndex(null); setExportStatus(null); captures.forEach((item) => deleteBestImageCapture(item.uri)); }
  };

  if (!payload && !gameData.isLoading) return <View style={[styles.center, { backgroundColor: theme.background }]}><Text style={{ color: theme.textMuted }}>当前账号没有可生成的 Phigros 成绩</Text></View>;
  return <>
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.heading, { color: theme.text }]}>选择类型</Text><View style={styles.row}>
        <Chip label="Best30" selected={type === 'best30'} onPress={() => setType('best30')} /><Chip label="自定义" selected={type === 'custom'} onPress={() => setType('custom')} />
      </View>
      {type === 'custom' ? <View style={[styles.panel, { backgroundColor: theme.surface }]}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>自定义筛选</Text><TextInput accessibilityLabel="自定义数量" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" placeholder="数量，0 为不限" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.input }]} />
        <Text style={[styles.caption, { color: theme.textMuted }]}>难度</Text><View style={styles.wrap}>{LEVELS.map((level, index) => <Chip key={level} label={level} selected={difficulties.includes(index as PhigrosBestImageDifficulty)} onPress={() => setDifficulties((current) => current.includes(index as PhigrosBestImageDifficulty) ? current.filter((value) => value !== index) : [...current, index as PhigrosBestImageDifficulty])} />)}</View>
        <View style={styles.row}><TextInput accessibilityLabel="最小定数" value={minConstant} onChangeText={setMinConstant} keyboardType="decimal-pad" placeholder="最小定数" placeholderTextColor={theme.textMuted} style={[styles.input, styles.flex, { color: theme.text, borderColor: theme.border, backgroundColor: theme.input }]} /><TextInput accessibilityLabel="最大定数" value={maxConstant} onChangeText={setMaxConstant} keyboardType="decimal-pad" placeholder="最大定数" placeholderTextColor={theme.textMuted} style={[styles.input, styles.flex, { color: theme.text, borderColor: theme.border, backgroundColor: theme.input }]} /></View>
        <View style={styles.row}><TextInput accessibilityLabel="最小Acc" value={minAcc} onChangeText={setMinAcc} keyboardType="decimal-pad" placeholder="最小 Acc" placeholderTextColor={theme.textMuted} style={[styles.input, styles.flex, { color: theme.text, borderColor: theme.border, backgroundColor: theme.input }]} /><TextInput accessibilityLabel="最大Acc" value={maxAcc} onChangeText={setMaxAcc} keyboardType="decimal-pad" placeholder="最大 Acc" placeholderTextColor={theme.textMuted} style={[styles.input, styles.flex, { color: theme.text, borderColor: theme.border, backgroundColor: theme.input }]} /></View>
        <Text style={[styles.caption, { color: theme.textMuted }]}>评价 / FC</Text><View style={styles.wrap}>{RATES.map((rate) => <Chip key={rate} label={rate === 'phi' ? 'φ' : rate.toUpperCase()} selected={rates.includes(rate)} onPress={() => setRates((current) => current.includes(rate) ? current.filter((value) => value !== rate) : [...current, rate])} />)}<Chip label="FC" selected={fcOnly} onPress={() => setFcOnly((value) => !value)} /></View>
        {!parsedFilters ? <Text style={{ color: theme.danger }}>请检查筛选范围和数量</Text> : null}
      </View> : null}
      <Text style={[styles.heading, { color: theme.text }]}>样式选择</Text>{(['avatar', 'background'] as const).map((kind) => <Pressable key={kind} accessibilityRole="button" accessibilityLabel={`选择${kind === 'avatar' ? '头像' : '背景'}`} onPress={() => setPicker(kind)} style={[styles.styleRow, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={{ color: theme.text, fontWeight: '700' }}>{kind === 'avatar' ? '头像' : '背景'}</Text><Text style={{ color: theme.textMuted }}>{stylePrefs[kind].mode === 'current' ? '玩家当前' : stylePrefs[kind].mode === 'off' ? '关闭' : stylePrefs[kind].mode === 'random' ? '随机' : stylePrefs[kind].key}</Text></Pressable>)}
      <Text style={[styles.heading, { color: theme.text }]}>分辨率</Text><View style={styles.row}>{WIDTHS.map((item) => <Chip key={item} label={`${item}px`} selected={width === item} onPress={() => setWidth(item)} />)}</View>
      <Text style={[styles.meta, { color: theme.textMuted }]}>{width} × {outputHeight} px · 第 {pageIndex + 1}/{pages.length} 页 · 每页最多 30 张</Text>
      <Text style={[styles.heading, { color: theme.text }]}>预览</Text><View accessibilityLabel="HTML图片预览窗" style={[styles.preview, { width: previewWidth, height: previewHeight, backgroundColor: theme.surface, borderColor: theme.border }]}>
        {sources ? <FlatList horizontal pagingEnabled data={sources} keyExtractor={(_, index) => pages[index]!.id} showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(event) => setPageIndex(Math.round(event.nativeEvent.contentOffset.x / previewWidth))} renderItem={({ item, index }) => <View style={{ width: previewWidth, height: previewHeight }}><WebView testID={`phigros-best-image-html-preview-${index}`} accessibilityLabel={`HTML图片预览 第${index + 1}页`} allowFileAccess={Platform.OS === 'android'} javaScriptEnabled originWhitelist={['*']} scrollEnabled={false} source={item} style={styles.webview} onMessage={(event) => { const height = parseBestImageHeightMessage(event.nativeEvent.data, width); if (height != null) setPageHeights((current) => ({ ...current, [pages[index]!.id]: height })); }} /></View>} /> : <View style={styles.center}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.textMuted }}>正在加载素材 {assetProgress.done}/{assetProgress.total}</Text></View>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="导出成绩图片" disabled={!sources || !parsedFilters && type === 'custom' || !!exportStatus} onPress={() => void exportImages()} style={[styles.export, { backgroundColor: theme.accent }, (!sources || !!exportStatus) && { opacity: .5 }]}><Text style={styles.exportText}>{exportStatus ?? '导出到相册'}</Text></Pressable>
    </ScrollView>
    <Modal visible={picker !== null} animationType="slide" onRequestClose={() => setPicker(null)}><View style={[styles.modal, { backgroundColor: theme.background }]}><Text style={[styles.modalTitle, { color: theme.text }]}>选择{picker === 'avatar' ? '头像' : '背景'}</Text><View style={styles.wrap}><Chip label="玩家当前" selected={false} onPress={() => chooseStyle({ mode: 'current' })} /><Chip label="随机" selected={false} onPress={() => chooseStyle({ mode: 'random' })} /><Chip label="关闭" selected={false} onPress={() => chooseStyle({ mode: 'off' })} /></View><FlatList data={pickerItems} keyExtractor={(item) => item.key} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`选择素材 ${item.label}`} onPress={() => chooseStyle({ mode: 'item', key: item.key })} style={[styles.pickerItem, { borderBottomColor: theme.border }]}><Text numberOfLines={1} style={{ color: theme.text }}>{item.label}</Text></Pressable>} /><Pressable onPress={() => setPicker(null)} style={styles.close}><Text style={{ color: theme.accent, fontWeight: '800' }}>取消</Text></Pressable></View></Modal>
    <Modal visible={exportIndex !== null} transparent={false} animationType="none" onRequestClose={() => exportReject.current?.(new Error('导出已取消'))}>{exportIndex !== null && sources?.[exportIndex] ? <View style={styles.exportRoot}><View ref={exportCaptureRef} collapsable={false} style={{ width: width / PixelRatio.get(), height: exportHeight / PixelRatio.get() }}><WebView key={`phi-export-${exportIndex}-${width}`} allowFileAccess={Platform.OS === 'android'} androidLayerType="software" javaScriptEnabled originWhitelist={['*']} scrollEnabled={false} source={sources[exportIndex]} style={styles.webview} onMessage={(event) => handleExportMessage(event.nativeEvent.data)} /></View><View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.textMuted }}>{exportStatus}</Text></View></View> : null}</Modal>
  </>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 36 }, heading: { fontSize: 15, fontWeight: '800', marginTop: 20, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, flex: { flex: 1 },
  chip: { minHeight: 38, minWidth: 68, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, chipText: { fontWeight: '700' },
  panel: { borderRadius: 16, padding: 14, gap: 10, marginTop: 14 }, panelTitle: { fontSize: 15, fontWeight: '800' }, caption: { fontSize: 12, fontWeight: '700' },
  input: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11 }, styleRow: { minHeight: 54, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { marginTop: 10, fontSize: 12 }, preview: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', alignSelf: 'center' }, webview: { flex: 1, backgroundColor: 'transparent' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  export: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 16 }, exportText: { color: '#FFF', fontWeight: '800' },
  modal: { flex: 1, padding: 20, paddingTop: 54 }, modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16 }, pickerItem: { minHeight: 50, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth }, close: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, exportRoot: { flex: 1, backgroundColor: '#111827' },
});

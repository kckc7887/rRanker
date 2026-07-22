import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Modal, PixelRatio, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';
import { useNotification } from '@/components/AppNotification';
import { formatPhigrosChallengeBadge } from '@/domain/phigros-challenge-theme';
import { loadPhigrosAvatarCatalog } from '@/domain/phigros-avatar-resolver';
import type { Song } from '@/domain/models';
import {
  parseBestImageHeightMessage, parseBestImageReadyMessage, parseBestImageRuntimeMessage,
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
  loadPhigrosAccAverages, type PhigrosAccAverage,
} from '@/features/phigros-best-image/load-phigros-acc-averages';
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
  findPhigrosReferenceAvatarKey, getPhigrosReferenceAvatarKeys,
  loadPhigrosReferenceAvatarUrl, loadPhigrosReferenceTemplateAssets,
  type PhigrosReferenceTemplateAssets,
} from '@/features/phigros-best-image/load-phigros-reference-template-assets';
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

type PreviewPhase = 'loading' | 'loaded' | 'rendering' | 'ready' | 'error' | 'crashed' | 'terminated';

const PREVIEW_PHASE_LABEL: Record<PreviewPhase, string> = {
  loading: '正在加载', loaded: '页面已载入，等待渲染', rendering: '正在渲染', ready: '渲染就绪',
  error: '加载失败', crashed: '渲染进程崩溃', terminated: '渲染进程已终止',
};

function ChoiceChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label}
    onPress={onPress} style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }, selected && { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
    <Text style={[styles.chipText, { color: theme.textSecondary }, selected && { color: theme.accent }]}>{label}</Text>
  </Pressable>;
}

function formatSyncTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
  const [avatarItems, setAvatarItems] = useState<string[]>(() => [...getPhigrosReferenceAvatarKeys()]); const [picker, setPicker] = useState<StyleKind | null>(null);
  const [illustrations, setIllustrations] = useState<Record<string, string | null> | null>(null);
  const [accAverages, setAccAverages] = useState<Record<string, PhigrosAccAverage> | null>(null);
  const [avatarData, setAvatarData] = useState<string | null>(null); const [backgroundData, setBackgroundData] = useState<string | null>(null);
  const [templateAssets, setTemplateAssets] = useState<PhigrosReferenceTemplateAssets | null>(null);
  const [templateAssetError, setTemplateAssetError] = useState<string | null>(null);
  const [assetProgress, setAssetProgress] = useState({ done: 0, total: 0 });
  const [sources, setSources] = useState<BestImageWebViewSource[] | null>(null);
  const [pageHeights, setPageHeights] = useState<Record<string, number>>({}); const [pageIndex, setPageIndex] = useState(0);
  const [previewStates, setPreviewStates] = useState<Record<string, { phase: PreviewPhase; version: string | null }>>({});
  const [exportIndex, setExportIndex] = useState<number | null>(null); const [exportHeight, setExportHeight] = useState(810);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const exportCaptureRef = useRef<View>(null); const exportResolve = useRef<((height: number) => void) | null>(null);
  const exportReject = useRef<((error: Error) => void) | null>(null); const exportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPrefsReady(false);
    void phigrosBestImagePreferencesStore.load(gameData.activeAccountId).then((value) => { setStylePrefs(value); setPrefsReady(true); });
  }, [gameData.activeAccountId]);
  useEffect(() => { if (prefsReady) void phigrosBestImagePreferencesStore.save(gameData.activeAccountId, stylePrefs); }, [gameData.activeAccountId, prefsReady, stylePrefs]);
  useEffect(() => {
    const bundled = [...getPhigrosReferenceAvatarKeys()];
    if (!provider) { setAvatarItems(bundled); return; }
    void provider.getGameVersion().then(loadPhigrosAvatarCatalog).then((remote) => {
      setAvatarItems([...new Set([...bundled, ...remote])]);
    }).catch(() => setAvatarItems(bundled));
  }, [provider]);
  useEffect(() => {
    let cancelled = false;
    setTemplateAssetError(null);
    void loadPhigrosReferenceTemplateAssets().then((assets) => {
      if (!cancelled) setTemplateAssets(assets);
    }).catch((error) => {
      if (!cancelled) setTemplateAssetError(error instanceof Error ? error.message : '无法加载 Phigros 参考模板素材');
    });
    return () => { cancelled = true; };
  }, []);

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
  const averageRecords = useMemo(() => type === 'best30'
    ? sections.filter((section) => !section.id.toLowerCase().includes('phi')).flatMap((section) => section.records)
    : sections.flatMap((section) => section.records), [sections, type]);
  const averageReferenceRks = useMemo(() => {
    if (type !== 'best30') return payload?.playerScore.value ?? 0;
    const phiRecords = sections.filter((section) => section.id.toLowerCase().includes('phi')).flatMap((section) => section.records).slice(0, 3);
    const bestRecords = sections.filter((section) => !section.id.toLowerCase().includes('phi')).flatMap((section) => section.records).slice(0, 27);
    return [...phiRecords, ...bestRecords].reduce((sum, record) => sum + record.rating, 0) / 30;
  }, [payload?.playerScore.value, sections, type]);

  useEffect(() => {
    let cancelled = false;
    setAccAverages(null);
    if (!payload) return;
    void loadPhigrosAccAverages(averageRecords, averageReferenceRks).then((averages) => {
      if (!cancelled) setAccAverages(averages);
    });
    return () => { cancelled = true; };
  }, [averageRecords, averageReferenceRks, payload]);

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
        await (findPhigrosReferenceAvatarKey(avatarKey) ? loadPhigrosReferenceAvatarUrl(avatarKey) : Promise.resolve(null))
        ?? await loadRemoteImageDataUri(avatarKey ? provider.getAvatarUrl(avatarKey) : payload?.avatarUrl)
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
  const htmlPages = useMemo(() => payload && illustrations && accAverages && templateAssets ? pages.map((page) => buildPhigrosBestImageHtml({
    type, width, page, playerName: payload.player.displayName, rks: payload.playerScore.display,
    dataAmount: payload.dataAmount,
    challenge: formatPhigrosChallengeBadge(payload.challengeModeRank), challengeModeRank: payload.challengeModeRank,
    syncedAt: formatSyncTime(payload.saveUpdatedAt),
    progress: payload.progress, titles, illustrations, accAverages, avatarDataUri: avatarData, backgroundDataUri: backgroundData,
    templateAssets,
  })) : null, [accAverages, avatarData, backgroundData, illustrations, pages, payload, templateAssets, titles, type, width]);

  useEffect(() => {
    setSources(null); setPageHeights({}); setPageIndex(0); setPreviewStates({});
    if (!htmlPages) return;
    if (Platform.OS !== 'android') { setSources(inlineBestImageWebViewSources(htmlPages)); return; }
    const prepared = prepareAndroidBestImageWebViewSources(htmlPages); setSources(prepared.sources); return prepared.dispose;
  }, [htmlPages]);

  const currentPage = pages[Math.min(pageIndex, pages.length - 1)]!;
  const outputHeight = pageHeights[currentPage.id] ?? Math.ceil(width * .75);
  const previewWidth = Math.min(720, Math.max(280, window.width - 32)); const previewHeight = previewWidth * .75;
  const currentPreviewState = previewStates[currentPage.id];
  const previewStatus = currentPreviewState
    ? `${PREVIEW_PHASE_LABEL[currentPreviewState.phase]}${currentPreviewState.version ? ` · WebView ${currentPreviewState.version}` : ''}`
    : 'WebView 版本未知 · 等待预览素材';
  const pickerItems: PickerItem[] = picker === 'avatar'
    ? avatarItems.map((key) => ({ key, label: key }))
    : songs.map((song: Song) => ({ key: song.id, label: song.title }));

  const chooseStyle = (choice: PhigrosImageStyleChoice) => {
    const kind = picker; if (!kind) return;
    const available = kind === 'avatar' ? avatarItems : songs.map((song) => song.id);
    const resolved = choice.mode === 'random' ? { mode: 'random' as const, key: resolvedRandom(available, `${gameData.activeAccountId}:${kind}:${Date.now()}`) } : choice;
    setStylePrefs((current) => ({ ...current, [kind]: resolved })); setPicker(null);
  };
  const styleValue = (kind: StyleKind): string => {
    const choice = stylePrefs[kind];
    if (choice.mode === 'current') return `玩家当前${kind === 'avatar' ? '头像' : '背景'}`;
    if (choice.mode === 'off') return '已关闭';
    if (choice.mode === 'random') return `随机${choice.key ? ` · ${kind === 'background' ? titles[choice.key] ?? choice.key : choice.key}` : ''}`;
    return kind === 'background' ? titles[choice.key ?? ''] ?? choice.key ?? '未设置' : choice.key ?? '未设置';
  };
  const updatePreviewState = (pageId: string, phase: PreviewPhase, version?: string | null) => {
    setPreviewStates((current) => ({ ...current, [pageId]: { phase, version: version === undefined ? current[pageId]?.version ?? null : version } }));
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
    <ScrollView style={[styles.page, { backgroundColor: theme.background }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.label, { color: theme.text }]}>选择类型</Text>
      <View accessibilityRole="tablist" style={[styles.segmentedControl, { backgroundColor: theme.surfaceMuted }]}>
        {([{ id: 'best30', label: 'Best30' }, { id: 'custom', label: '自定义' }] as const).map((item) => {
          const selected = type === item.id;
          return <Pressable key={item.id} accessibilityLabel={item.label} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setType(item.id)} style={[styles.segment, selected && { backgroundColor: theme.surface }]}>
            <Text style={[styles.segmentText, { color: theme.textMuted }, selected && { color: theme.accent }]}>{item.label}</Text>
          </Pressable>;
        })}
      </View>

      {type === 'custom' ? <View style={[styles.customPanel, { backgroundColor: theme.surface }]}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>自定义 BestN</Text>
        <View style={styles.fieldRow}>
          <View style={styles.textFieldWrap}><Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>数量</Text><TextInput accessibilityLabel="自定义数量" autoCorrect={false} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" placeholder="0 为无限制" placeholderTextColor={theme.textMuted} style={[styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.input }, parsePhigrosImageQuantity(quantity) === null && styles.textInputError]} /></View>
          <View style={styles.textFieldWrap}><Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>难度</Text><View style={styles.chipRow}>{LEVELS.map((level, index) => <ChoiceChip key={level} label={level} selected={difficulties.includes(index as PhigrosBestImageDifficulty)} onPress={() => setDifficulties((current) => current.includes(index as PhigrosBestImageDifficulty) ? current.filter((value) => value !== index) : [...current, index as PhigrosBestImageDifficulty])} />)}</View></View>
        </View>
        <View style={styles.fieldRow}>
          <View style={styles.textFieldWrap}><Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>最小定数</Text><TextInput accessibilityLabel="最小定数" autoCorrect={false} value={minConstant} onChangeText={setMinConstant} keyboardType="decimal-pad" placeholder="0–20" placeholderTextColor={theme.textMuted} style={[styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.input }]} /></View>
          <View style={styles.textFieldWrap}><Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>最大定数</Text><TextInput accessibilityLabel="最大定数" autoCorrect={false} value={maxConstant} onChangeText={setMaxConstant} keyboardType="decimal-pad" placeholder="0–20" placeholderTextColor={theme.textMuted} style={[styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.input }]} /></View>
        </View>
        <View style={styles.fieldRow}>
          <View style={styles.textFieldWrap}><Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>最小 Acc</Text><TextInput accessibilityLabel="最小Acc" autoCorrect={false} value={minAcc} onChangeText={setMinAcc} keyboardType="decimal-pad" placeholder="0–100" placeholderTextColor={theme.textMuted} style={[styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.input }]} /></View>
          <View style={styles.textFieldWrap}><Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>最大 Acc</Text><TextInput accessibilityLabel="最大Acc" autoCorrect={false} value={maxAcc} onChangeText={setMaxAcc} keyboardType="decimal-pad" placeholder="0–100" placeholderTextColor={theme.textMuted} style={[styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.input }]} /></View>
        </View>
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>评价 / FC</Text>
        <View style={styles.chipRow}>{RATES.map((rate) => <ChoiceChip key={rate} label={rate === 'phi' ? 'φ' : rate.toUpperCase()} selected={rates.includes(rate)} onPress={() => setRates((current) => current.includes(rate) ? current.filter((value) => value !== rate) : [...current, rate])} />)}<ChoiceChip label="FC" selected={fcOnly} onPress={() => setFcOnly((value) => !value)} /></View>
        {!parsedFilters ? <Text style={[styles.errorText, { color: theme.danger }]}>请检查数量、筛选范围，并至少选择一个难度</Text> : null}
      </View> : null}

      <Text style={[styles.label, styles.sectionLabel, { color: theme.text }]}>样式选择</Text>
      <View style={[styles.styleList, { backgroundColor: theme.surface }]}>
        {(['avatar', 'background'] as const).map((kind) => <Pressable key={kind} accessibilityRole="button" accessibilityLabel={`选择${kind === 'avatar' ? '头像' : '背景'}`} onPress={() => setPicker(kind)} style={({ pressed }) => [styles.styleRow, { borderBottomColor: theme.border }, pressed && { backgroundColor: theme.surfaceMuted }]}>
          <View style={styles.stylePreview}>{kind === 'avatar' ? (avatarData ? <Image source={{ uri: avatarData }} style={styles.avatarPreview} /> : <Text style={[styles.noAsset, { color: theme.textMuted }]}>未设置</Text>) : (backgroundData ? <Image source={{ uri: backgroundData }} style={styles.backgroundPreview} /> : <Text style={[styles.noAsset, { color: theme.textMuted }]}>未设置</Text>)}</View>
          <View style={styles.styleCopy}><Text style={[styles.styleName, { color: theme.text }]}>{kind === 'avatar' ? '头像' : '背景'}</Text><Text numberOfLines={1} style={[styles.styleValue, { color: theme.textMuted }]}>{styleValue(kind)}</Text></View>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
        </Pressable>)}
      </View>

      <Text style={[styles.label, styles.sectionLabel, { color: theme.text }]}>分辨率</Text>
      <View style={styles.widthOptions}>{WIDTHS.map((item) => {
        const selected = width === item;
        return <Pressable key={item} accessibilityLabel={`宽度 ${item} 像素`} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setWidth(item)} style={[styles.widthOption, { backgroundColor: theme.surface, borderColor: theme.border }, selected && { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}><Text style={[styles.widthOptionText, { color: theme.textMuted }, selected && { color: theme.accent }]}>{item}px</Text></Pressable>;
      })}</View>
      <Text style={[styles.dimensionMeta, { color: theme.textMuted }]}>{width} × {outputHeight} px · 每页最多 30 张 · 第 {pageIndex + 1}/{pages.length} 页</Text>

      <Text style={[styles.label, styles.sectionLabel, { color: theme.text }]}>预览</Text>
      <View accessibilityLabel="HTML图片预览窗" style={[styles.previewFrame, { width: previewWidth, height: previewHeight, backgroundColor: theme.surface, borderColor: theme.border }]}>
        {sources ? <FlatList data={sources} horizontal initialNumToRender={2} keyExtractor={(_, index) => pages[index]!.id} maxToRenderPerBatch={3} pagingEnabled removeClippedSubviews={false} showsHorizontalScrollIndicator={false} windowSize={3} style={styles.previewPager} onMomentumScrollEnd={(event) => setPageIndex(Math.round(event.nativeEvent.contentOffset.x / previewWidth))} renderItem={({ item, index }) => {
          const pageId = pages[index]!.id;
          return <View style={{ width: previewWidth, height: previewHeight }}><WebView testID={`phigros-best-image-html-preview-${index}`} accessibilityLabel={`HTML图片预览 第${index + 1}页`} allowFileAccess={Platform.OS === 'android'} allowFileAccessFromFileURLs allowingReadAccessToURL={templateAssets?.allowingReadAccessToUrl} bounces={false} javaScriptEnabled mixedContentMode="never" originWhitelist={['*']} scrollEnabled={false} source={item} style={styles.webview} onError={() => updatePreviewState(pageId, 'error')} onLoadStart={() => updatePreviewState(pageId, 'loading')} onLoadEnd={() => setPreviewStates((current) => current[pageId] && current[pageId]!.phase !== 'loading' ? current : { ...current, [pageId]: { phase: 'loaded', version: current[pageId]?.version ?? null } })} onRenderProcessGone={(event) => updatePreviewState(pageId, event.nativeEvent.didCrash ? 'crashed' : 'terminated')} onMessage={(event) => {
            const runtime = parseBestImageRuntimeMessage(event.nativeEvent.data, width); if (runtime) updatePreviewState(pageId, 'rendering', runtime.version);
            const height = parseBestImageHeightMessage(event.nativeEvent.data, width); if (height != null) { setPageHeights((current) => ({ ...current, [pageId]: height })); updatePreviewState(pageId, 'rendering'); }
            const ready = parseBestImageReadyMessage(event.nativeEvent.data, width); if (ready != null) updatePreviewState(pageId, 'ready');
          }} /></View>;
        }} /> : <View style={styles.loadingPreview}>{templateAssetError ? <Text accessibilityRole="alert" style={[styles.assetError, { color: theme.danger }]}>{templateAssetError}</Text> : <View style={styles.loadingContent}><ActivityIndicator accessibilityLabel="正在加载预览素材" color={theme.accent} size="large" /><Text style={[styles.loadingText, { color: theme.textMuted }]}>{!templateAssets ? '正在加载原始 B30 模板与字体' : assetProgress.total > 0 ? `正在逐张缓存歌曲封面 ${assetProgress.done}/${assetProgress.total}` : '正在加载预览素材'}</Text></View>}</View>}
      </View>
      {pages.length > 1 ? <View style={styles.pageDots}>{pages.map((page, index) => <View key={page.id} style={[styles.pageDot, { backgroundColor: theme.border }, index === pageIndex && { backgroundColor: theme.accent, width: 18 }]} />)}</View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="导出成绩图片" disabled={!sources || (!parsedFilters && type === 'custom') || !!exportStatus} onPress={() => void exportImages()} style={[styles.exportButton, { backgroundColor: theme.accent }, (!sources || !!exportStatus) && styles.exportButtonDisabled]}>{exportStatus ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}<Text style={styles.exportButtonText}>{exportStatus ?? '导出到相册'}</Text></Pressable>
      <Text accessibilityLiveRegion="polite" style={[styles.webViewStatusText, { color: theme.textMuted }]} testID="phigros-best-image-webview-status">{previewStatus}</Text>
    </ScrollView>
    <Modal visible={picker !== null} animationType="slide" onRequestClose={() => setPicker(null)}><View style={[styles.modal, { backgroundColor: theme.background }]}><View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: theme.text }]}>选择{picker === 'avatar' ? '头像' : '背景'}</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭素材选择" onPress={() => setPicker(null)}><Text style={[styles.modalCloseText, { color: theme.accent }]}>完成</Text></Pressable></View><View style={styles.chipRow}><ChoiceChip label="玩家当前" selected={picker ? stylePrefs[picker].mode === 'current' : false} onPress={() => chooseStyle({ mode: 'current' })} /><ChoiceChip label="随机" selected={picker ? stylePrefs[picker].mode === 'random' : false} onPress={() => chooseStyle({ mode: 'random' })} /><ChoiceChip label="关闭" selected={picker ? stylePrefs[picker].mode === 'off' : false} onPress={() => chooseStyle({ mode: 'off' })} /></View><FlatList contentContainerStyle={styles.pickerList} data={pickerItems} keyExtractor={(item) => item.key} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`选择素材 ${item.label}`} onPress={() => chooseStyle({ mode: 'item', key: item.key })} style={({ pressed }) => [styles.pickerItem, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && { backgroundColor: theme.surfaceMuted }]}><Text numberOfLines={1} style={[styles.pickerItemText, { color: theme.text }]}>{item.label}</Text><Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text></Pressable>} /></View></Modal>
    <Modal visible={exportIndex !== null} transparent={false} animationType="none" onRequestClose={() => exportReject.current?.(new Error('导出已取消'))}>{exportIndex !== null && sources?.[exportIndex] ? <View style={styles.exportRoot}><View ref={exportCaptureRef} collapsable={false} style={{ width: width / PixelRatio.get(), height: exportHeight / PixelRatio.get() }}><WebView key={`phi-export-${exportIndex}-${width}`} allowFileAccess={Platform.OS === 'android'} allowFileAccessFromFileURLs allowingReadAccessToURL={templateAssets?.allowingReadAccessToUrl} androidLayerType="software" bounces={false} javaScriptEnabled mixedContentMode="never" originWhitelist={['*']} scrollEnabled={false} source={sources[exportIndex]} style={styles.webview} onMessage={(event) => handleExportMessage(event.nativeEvent.data)} /></View><View style={[styles.exportOverlay, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.accent} size="large" /><Text style={[styles.exportOverlayText, { color: theme.textSecondary }]}>{exportStatus ?? '正在准备导出'}</Text></View></View> : null}</Modal>
  </>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, alignItems: 'stretch' },
  label: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  sectionLabel: { marginTop: 24 },
  segmentedControl: { flexDirection: 'row', padding: 4, borderRadius: 14 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  segmentText: { fontSize: 14, fontWeight: '700' },
  customPanel: { marginTop: 16, padding: 14, gap: 10, borderRadius: 16 },
  panelTitle: { fontSize: 15, fontWeight: '800' },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  textFieldWrap: { flex: 1, minWidth: 0 },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  textInput: { minHeight: 40, paddingHorizontal: 11, borderWidth: 1, borderRadius: 10, fontSize: 14 },
  textInputError: { borderColor: '#D92D20' },
  errorText: { marginTop: 4, fontSize: 10, lineHeight: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minWidth: 46, height: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderRadius: 999 },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center', includeFontPadding: false },
  styleList: { overflow: 'hidden', borderRadius: 16 },
  styleRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  stylePreview: { width: 132, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  avatarPreview: { width: 46, height: 46, borderRadius: 10 },
  backgroundPreview: { width: 132, height: 46, borderRadius: 8 },
  styleCopy: { flex: 1, minWidth: 0 },
  styleName: { fontSize: 14, fontWeight: '800' },
  styleValue: { fontSize: 12, marginTop: 3 },
  chevron: { fontSize: 26, fontWeight: '300' },
  noAsset: { fontSize: 12 },
  widthOptions: { flexDirection: 'row', gap: 8 },
  widthOption: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1 },
  widthOptionText: { fontSize: 13, fontWeight: '700' },
  dimensionMeta: { fontSize: 12, marginTop: 8, textAlign: 'right' },
  previewFrame: { alignSelf: 'center', overflow: 'hidden', borderRadius: 18, borderWidth: 1 },
  previewPager: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
  loadingPreview: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingContent: { alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 12, fontWeight: '600' },
  assetError: { paddingHorizontal: 20, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  pageDots: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  pageDot: { width: 6, height: 6, borderRadius: 3 },
  exportButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 14, borderRadius: 14 },
  exportButtonDisabled: { opacity: 0.55 },
  exportButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  webViewStatusText: { marginTop: 7, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  modal: { flex: 1, padding: 16, paddingTop: 54 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalCloseText: { fontSize: 15, fontWeight: '800' },
  pickerList: { gap: 8, paddingTop: 18, paddingBottom: 32 },
  pickerItem: { minHeight: 54, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerItemText: { flex: 1, fontSize: 14, fontWeight: '700' },
  exportRoot: { flex: 1, overflow: 'hidden', backgroundColor: '#111111' },
  exportOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12 },
  exportOverlayText: { fontSize: 14, fontWeight: '700' },
});

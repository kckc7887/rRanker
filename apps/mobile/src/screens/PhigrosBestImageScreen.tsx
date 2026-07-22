import { useEffect, useMemo, useRef, useState } from 'react';
import type { Directory } from 'expo-file-system';
import {
  ActivityIndicator, FlatList, Image, Modal, PixelRatio, Platform, Pressable, ScrollView,
  StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';
import { useNotification } from '@/components/AppNotification';
import { formatPhigrosChallengeBadge } from '@/domain/phigros-challenge-theme';
import { loadPhigrosAvatarCatalog } from '@/domain/phigros-avatar-resolver';
import {
  parseBestImageHeightMessage, parseBestImageReadyMessage, parseBestImageRuntimeMessage,
} from '@/features/best-image/build-best-image-html';
import {
  bestImageCaptureDimensions, bestImageExportFilename, deleteBestImageCapture,
  isDrawViewHierarchyError, requestBestImageExportPermission, saveBestImageCapture,
  shouldUseBestImageRenderInContext,
} from '@/features/best-image/best-image-export';
import {
  prepareBestImageWebViewSources, type BestImageWebViewSource,
} from '@/features/best-image/prepare-best-image-webview-sources';
import { buildPhigrosBestImageHtml } from '@/features/phigros-best-image/build-phigros-best-image-html';
import { collectPhigrosBestImageVisibleStrings } from '@/features/phigros-best-image/collect-phigros-best-image-visible-strings';
import {
  loadPhigrosAccAverages, type PhigrosAccAverage,
} from '@/features/phigros-best-image/load-phigros-acc-averages';
import {
  appendPhigrosOverflowRecords, paginatePhigrosBestImageSections,
  sortPhigrosBestImageRecords, type PhigrosBestImageOverflowCount, type PhigrosBestImageType,
} from '@/features/phigros-best-image/phigros-best-image';
import {
  loadPhigrosIllustrations, loadRemoteImageDataUri,
} from '@/features/phigros-best-image/load-phigros-image-assets';
import {
  findPhigrosReferenceAvatarKey, getPhigrosReferenceAvatarKeys, getPhigrosReferenceAvatarSource,
  loadPhigrosReferenceAvatarUrl, loadPhigrosReferenceTemplateAssets,
  type PhigrosReferenceTemplateAssets,
} from '@/features/phigros-best-image/load-phigros-reference-template-assets';
import {
  preparePhigrosFonts, type PhigrosFontProgress,
} from '@/features/phigros-best-image/phigros-font-cache';
import {
  resolveNeededPhigrosFonts, trimPhigrosBestImageCss,
} from '@/features/phigros-best-image/phigros-font-coverage';
import {
  phigrosBestImagePreferencesStore, type PhigrosBestImageStylePreferences,
  type PhigrosImageStyleChoice,
} from '@/features/phigros-best-image/phigros-best-image-preferences';
import {
  PhigrosBestImageStylePicker, type PhigrosBestImagePickerItem,
  type PhigrosBestImagePickerKind,
} from '@/features/phigros-best-image/phigros-best-image-style-picker';
import { useGameData } from '@/hooks/use-game-data';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { useAppTheme } from '@/theme/app-theme';

const WIDTHS = [1080, 1440, 2160] as const;
const OVERFLOW_COUNTS: readonly PhigrosBestImageOverflowCount[] = [0, 3, 6, 9];
const DEFAULT_STYLES: PhigrosBestImageStylePreferences = {
  version: 1, avatar: { mode: 'current' }, background: { mode: 'current' }, overflowCount: 0,
};

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

function fontProgressLabel(progress: PhigrosFontProgress): string {
  const count = `已完成 ${progress.completed}/${progress.total}`;
  if (progress.phase === 'ready') return `所需字体已准备 · ${count}`;
  if (progress.phase === 'core-ready') return `核心字体已准备 · ${count}`;
  if (progress.phase === 'downloading-core') return `正在准备核心字体${progress.currentFont ? ` · ${progress.currentFont}` : ''} · ${count}`;
  if (progress.phase === 'downloading-extensions') return `正在下载所需扩展字体${progress.currentFont ? ` · ${progress.currentFont}` : ''} · ${count}`;
  return `正在检查字体缓存${progress.currentFont ? ` · ${progress.currentFont}` : ''} · ${count}`;
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
  const [stylePrefs, setStylePrefs] = useState(DEFAULT_STYLES); const [prefsReady, setPrefsReady] = useState(false);
  const [avatarItems, setAvatarItems] = useState<string[]>(() => [...getPhigrosReferenceAvatarKeys()]); const [picker, setPicker] = useState<PhigrosBestImagePickerKind | null>(null);
  const [illustrations, setIllustrations] = useState<Record<string, string | null> | null>(null);
  const [accAverages, setAccAverages] = useState<Record<string, PhigrosAccAverage> | null>(null);
  const [avatarData, setAvatarData] = useState<string | null>(null); const [backgroundData, setBackgroundData] = useState<string | null>(null);
  const [templateAssets, setTemplateAssets] = useState<PhigrosReferenceTemplateAssets | null>(null);
  const [templateAssetError, setTemplateAssetError] = useState<string | null>(null);
  const [fontDirectory, setFontDirectory] = useState<Directory | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [fontAttempt, setFontAttempt] = useState(0);
  const [fontProgress, setFontProgress] = useState<PhigrosFontProgress>({
    phase: 'checking', completed: 0, total: 2, currentFont: null,
  });
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
  const sections = useMemo(() => {
    if (!payload) return [];
    if (type === 'best30') return appendPhigrosOverflowRecords(payload.bestSections, payload.records, stylePrefs.overflowCount);
    return [{ id: 'custom', title: '自定义', records: sortPhigrosBestImageRecords(payload.records) }];
  }, [payload, stylePrefs.overflowCount, type]);
  const pages = useMemo(() => paginatePhigrosBestImageSections(
    sections,
    type === 'best30' ? 30 + stylePrefs.overflowCount : 30,
  ), [sections, stylePrefs.overflowCount, type]);
  const titles = useMemo(() => Object.fromEntries(songs.map((song) => [song.id, song.title])), [songs]);
  const neededFontEntries = useMemo(() => {
    if (!payload) return resolveNeededPhigrosFonts([]);
    return resolveNeededPhigrosFonts(collectPhigrosBestImageVisibleStrings({
      type,
      playerName: payload.player.displayName,
      rks: payload.playerScore.display,
      dataAmount: payload.dataAmount,
      challenge: formatPhigrosChallengeBadge(payload.challengeModeRank),
      syncedAt: formatSyncTime(payload.saveUpdatedAt),
      titles,
      pages,
    }));
  }, [pages, payload, titles, type]);
  const neededFontKey = neededFontEntries.map((entry) => entry.name).join('|');

  useEffect(() => {
    let cancelled = false;
    setTemplateAssetError(null);
    setFontsReady(false);
    const neededNames = neededFontEntries.map((entry) => entry.name);
    void (async () => {
      const prepared = await preparePhigrosFonts((progress) => {
        if (!cancelled) setFontProgress(progress);
      }, { neededNames });
      const fullResult = prepared.fullReady.then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      const assets = await loadPhigrosReferenceTemplateAssets(prepared.directory.uri);
      const trimmedAssets = {
        ...assets,
        css: trimPhigrosBestImageCss(assets.css, neededFontEntries),
      };
      if (!cancelled) {
        setFontDirectory(prepared.directory);
        setTemplateAssets(trimmedAssets);
      }
      const result = await fullResult;
      if (!result.ok) throw result.error;
      if (!cancelled) {
        setFontsReady(true);
        // 重新创建对象以强制重建 HTML，使已补齐的扩展字体进入当前 WebView。
        setTemplateAssets({ ...trimmedAssets });
      }
    })().catch((error) => {
      if (!cancelled) setTemplateAssetError(error instanceof Error ? error.message : '无法加载 Phigros 参考模板素材');
    });
    return () => { cancelled = true; };
  }, [fontAttempt, neededFontKey, neededFontEntries]);
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

  const selectStyleKey = (kind: PhigrosBestImagePickerKind, choice: PhigrosImageStyleChoice): string | null => {
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
    if (!htmlPages || !fontDirectory) return;
    const prepared = prepareBestImageWebViewSources(htmlPages, fontDirectory); setSources(prepared.sources); return prepared.dispose;
  }, [fontDirectory, htmlPages]);

  const currentPage = pages[Math.min(pageIndex, pages.length - 1)]!;
  const outputHeight = pageHeights[currentPage.id] ?? Math.ceil(width * .75);
  const screenWidth = window.width > 0 ? window.width : 390;
  const previewWidth = Math.min(720, Math.max(280, screenWidth - 32));
  const previewHeight = previewWidth * 4 / 3;
  const currentPreviewState = previewStates[currentPage.id];
  const previewStatus = currentPreviewState
    ? `${PREVIEW_PHASE_LABEL[currentPreviewState.phase]}${currentPreviewState.version ? ` · WebView ${currentPreviewState.version}` : ''}`
    : 'WebView 版本未知 · 等待预览素材';
  const avatarPickerItems = useMemo<PhigrosBestImagePickerItem[]>(() => avatarItems.flatMap((key) => {
    const bundledSource = getPhigrosReferenceAvatarSource(key);
    const remoteUrl = provider?.getAvatarUrl(key);
    const source = bundledSource ?? (remoteUrl ? { uri: remoteUrl } : null);
    return source ? [{ key, label: key, meta: '头像', source }] : [];
  }), [avatarItems, provider]);
  const backgroundPickerItems = useMemo<PhigrosBestImagePickerItem[]>(() => provider ? songs.flatMap((song) => {
    const uri = provider.getIllustrationUrl(song.id);
    return uri ? [{ key: song.id, label: song.title, meta: song.id, source: { uri } }] : [];
  }) : [], [provider, songs]);
  const pickerItems = picker === 'avatar' ? avatarPickerItems : backgroundPickerItems;

  const chooseStyle = (choice: PhigrosImageStyleChoice) => {
    const kind = picker; if (!kind) return;
    setStylePrefs((current) => ({ ...current, [kind]: choice })); setPicker(null);
  };
  const styleValue = (kind: PhigrosBestImagePickerKind): string => {
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
    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportResolve.current = resolve;
    exportReject.current = reject;
    setExportHeight(pageHeights[pages[index]!.id] ?? Math.ceil(width * .75));
    setExportIndex(index);
    exportTimer.current = setTimeout(() => {
      exportResolve.current = null;
      exportReject.current = null;
      reject(new Error('图片渲染超时'));
    }, 30_000);
  });
  const handleExportMessage = (value: string) => {
    const measured = parseBestImageHeightMessage(value, width, 1); if (measured != null) setExportHeight(measured);
    const ready = parseBestImageReadyMessage(value, width, 1); if (ready == null || !exportResolve.current) return;
    setExportHeight(ready);
    const resolve = exportResolve.current;
    exportResolve.current = null;
    exportReject.current = null;
    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportTimer.current = null;
    setTimeout(() => resolve(ready), 320);
  };
  const exportImages = async () => {
    if (!payload || !sources || !htmlPages || !fontsReady || exportStatus) return;
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

      <Text style={[styles.label, styles.sectionLabel, { color: theme.text }]}>样式选择</Text>
      <View style={[styles.styleList, { backgroundColor: theme.surface }]}>
        <View style={[styles.overflowStyleRow, { borderBottomColor: theme.border }]}>
          <View style={styles.overflowCopy}><Text style={[styles.styleName, { color: theme.text }]}>OVER FLOW</Text><Text style={[styles.styleValue, { color: theme.textMuted }]}>追加成绩数量</Text></View>
          <View style={styles.overflowChoices}>{OVERFLOW_COUNTS.map((count) => <ChoiceChip key={count} label={`${count} 个`} selected={stylePrefs.overflowCount === count} onPress={() => setStylePrefs((current) => ({ ...current, overflowCount: count }))} />)}</View>
        </View>
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
      <Text style={[styles.dimensionMeta, { color: theme.textMuted }]}>{width} × {outputHeight} px · 每页最多 {type === 'best30' ? 30 + stylePrefs.overflowCount : 30} 张 · 第 {pageIndex + 1}/{pages.length} 页</Text>

      <Text style={[styles.label, styles.sectionLabel, { color: theme.text }]}>预览</Text>
      <View accessibilityLabel="HTML图片预览窗" style={[styles.previewFrame, { width: previewWidth, height: previewHeight, backgroundColor: theme.surface, borderColor: theme.border }]}>
        {sources ? <FlatList data={sources} horizontal initialNumToRender={2} keyExtractor={(_, index) => pages[index]!.id} maxToRenderPerBatch={3} pagingEnabled removeClippedSubviews={false} showsHorizontalScrollIndicator={false} windowSize={3} style={styles.previewPager} onMomentumScrollEnd={(event) => setPageIndex(Math.round(event.nativeEvent.contentOffset.x / previewWidth))} renderItem={({ item, index }) => {
          const pageId = pages[index]!.id;
          return <View style={{ width: previewWidth, height: previewHeight }}><WebView testID={`phigros-best-image-html-preview-${index}`} accessibilityLabel={`HTML图片预览 第${index + 1}页`} allowFileAccess={Platform.OS === 'android'} allowFileAccessFromFileURLs allowingReadAccessToURL={templateAssets?.allowingReadAccessToUrl} bounces={false} javaScriptEnabled mixedContentMode="never" originWhitelist={['*']} scrollEnabled={false} source={item} style={styles.webview} onError={() => updatePreviewState(pageId, 'error')} onLoadStart={() => updatePreviewState(pageId, 'loading')} onLoadEnd={() => setPreviewStates((current) => current[pageId] && current[pageId]!.phase !== 'loading' ? current : { ...current, [pageId]: { phase: 'loaded', version: current[pageId]?.version ?? null } })} onRenderProcessGone={(event) => updatePreviewState(pageId, event.nativeEvent.didCrash ? 'crashed' : 'terminated')} onMessage={(event) => {
            const runtime = parseBestImageRuntimeMessage(event.nativeEvent.data, width); if (runtime) updatePreviewState(pageId, 'rendering', runtime.version);
            const height = parseBestImageHeightMessage(event.nativeEvent.data, width, 1); if (height != null) { setPageHeights((current) => ({ ...current, [pageId]: height })); updatePreviewState(pageId, 'rendering'); }
            const ready = parseBestImageReadyMessage(event.nativeEvent.data, width, 1); if (ready != null) updatePreviewState(pageId, 'ready');
          }} /></View>;
        }} /> : <View style={styles.loadingPreview}>{templateAssetError ? <View style={styles.loadingContent}><Text accessibilityRole="alert" style={[styles.assetError, { color: theme.danger }]}>{templateAssetError}</Text><Pressable accessibilityRole="button" accessibilityLabel="重试字体下载" onPress={() => setFontAttempt((value) => value + 1)} style={[styles.retryButton, { borderColor: theme.accent }]}><Text style={[styles.retryButtonText, { color: theme.accent }]}>重试</Text></Pressable></View> : <View style={styles.loadingContent}><ActivityIndicator accessibilityLabel="正在加载预览素材" color={theme.accent} size="large" /><Text style={[styles.loadingText, { color: theme.textMuted }]}>{!templateAssets ? fontProgressLabel(fontProgress) : assetProgress.total > 0 ? `正在逐张缓存歌曲封面 ${assetProgress.done}/${assetProgress.total}` : '正在加载预览素材'}</Text></View>}</View>}
      </View>
      {sources && !fontsReady ? <View accessibilityLiveRegion="polite" style={[styles.fontStatus, { backgroundColor: theme.surface, borderColor: templateAssetError ? theme.danger : theme.border }]}>{templateAssetError ? <><Text accessibilityRole="alert" style={[styles.fontStatusText, { color: theme.danger }]}>{templateAssetError}</Text><Pressable accessibilityRole="button" accessibilityLabel="重试字体下载" onPress={() => setFontAttempt((value) => value + 1)} style={[styles.retryButton, { borderColor: theme.accent }]}><Text style={[styles.retryButtonText, { color: theme.accent }]}>重试</Text></Pressable></> : <><ActivityIndicator color={theme.accent} size="small" /><Text style={[styles.fontStatusText, { color: theme.textMuted }]}>{fontProgressLabel(fontProgress)}；所需字体完成后可导出</Text></>}</View> : null}
      {pages.length > 1 ? <View style={styles.pageDots}>{pages.map((page, index) => <View key={page.id} style={[styles.pageDot, { backgroundColor: theme.border }, index === pageIndex && { backgroundColor: theme.accent, width: 18 }]} />)}</View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="导出成绩图片" disabled={!sources || !fontsReady || !!exportStatus} onPress={() => void exportImages()} style={[styles.exportButton, { backgroundColor: theme.accent }, (!sources || !fontsReady || !!exportStatus) && styles.exportButtonDisabled]}>{exportStatus ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}<Text style={styles.exportButtonText}>{exportStatus ?? (fontsReady ? '导出到相册' : '所需字体准备完成后可导出')}</Text></Pressable>
      <Text accessibilityLiveRegion="polite" style={[styles.webViewStatusText, { color: theme.textMuted }]} testID="phigros-best-image-webview-status">{previewStatus}</Text>
    </ScrollView>
    <PhigrosBestImageStylePicker visible={picker !== null} kind={picker} items={pickerItems} selection={picker ? stylePrefs[picker] : null} onClose={() => setPicker(null)} onSelect={chooseStyle} />
    <Modal visible={exportIndex !== null} transparent={false} animationType="none" onRequestClose={() => exportReject.current?.(new Error('导出已取消'))}>{exportIndex !== null && sources?.[exportIndex] ? <View style={styles.exportRoot}><View accessibilityLabel={`导出画布 第${exportIndex + 1}页`} ref={exportCaptureRef} collapsable={false} style={{ width: width / PixelRatio.get(), height: exportHeight / PixelRatio.get() }}><WebView accessibilityLabel={`导出渲染 第${exportIndex + 1}页`} key={`phi-export-${exportIndex}-${width}`} allowFileAccess={Platform.OS === 'android'} allowFileAccessFromFileURLs allowingReadAccessToURL={templateAssets?.allowingReadAccessToUrl} androidLayerType="software" bounces={false} javaScriptEnabled mixedContentMode="never" originWhitelist={['*']} scrollEnabled={false} source={sources[exportIndex]} style={styles.webview} onMessage={(event) => handleExportMessage(event.nativeEvent.data)} /></View><View style={[styles.exportOverlay, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.accent} size="large" /><Text style={[styles.exportOverlayText, { color: theme.textSecondary }]}>{exportStatus ?? '正在准备导出'}</Text></View></View> : null}</Modal>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minWidth: 46, height: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderRadius: 999 },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center', includeFontPadding: false },
  styleList: { overflow: 'hidden', borderRadius: 16 },
  overflowStyleRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  overflowCopy: { flex: 1, minWidth: 0 },
  overflowChoices: { flexDirection: 'row', gap: 6 },
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
  fontStatus: { minHeight: 44, marginTop: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  fontStatusText: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
  retryButton: { minHeight: 32, minWidth: 68, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 999 },
  retryButtonText: { fontSize: 12, fontWeight: '800' },
  pageDots: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  pageDot: { width: 6, height: 6, borderRadius: 3 },
  exportButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 14, borderRadius: 14 },
  exportButtonDisabled: { opacity: 0.55 },
  exportButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  webViewStatusText: { marginTop: 7, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  exportRoot: { flex: 1, overflow: 'hidden', backgroundColor: '#111111' },
  exportOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12 },
  exportOverlayText: { fontSize: 14, fontWeight: '700' },
});

import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import type { Directory } from 'expo-file-system';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { PhigrosRateBadge } from '@/components/phigros/PhigrosRateBadge';
import { formatPhigrosChallengeBadge } from '@/domain/phigros-challenge-theme';
import {
  PHIGROS_LEVELS, PHIGROS_RANK_FILTERS, phigrosLevelLabel, phigrosRankFilterLabel,
  type PhigrosRankFilter,
} from '@/domain/phigros-filters';
import type { PhigrosLevel } from '@/domain/phigros';
import type { PhigrosXingKind } from '@/domain/phigros-xing';
import { phigrosLevelColors } from '@/domain/phigros-level-theme';
import { loadPhigrosAvatarCatalog } from '@/domain/phigros-avatar-resolver';
import { bestImageExportFilename } from '@/features/best-image/best-image-export';
import {
  BestImageChoiceChip,
  BestImageScreenShell,
  bestImageScreenSharedStyles,
} from '@/features/best-image/best-image-screen-shell';
import { useBestImageScreenController } from '@/features/best-image/use-best-image-screen-controller';
import {
  prepareBestImageWebViewSources, type BestImageWebViewSource,
} from '@/features/best-image/prepare-best-image-webview-sources';
import { buildPhigrosBestImageHtml } from '@/features/phigros-best-image/build-phigros-best-image-html';
import { buildPhigrosBestImageAppHtml } from '@/features/phigros-best-image/build-phigros-best-image-app-html';
import { collectPhigrosBestImageVisibleStrings } from '@/features/phigros-best-image/collect-phigros-best-image-visible-strings';
import {
  loadPhigrosAccAverages, type PhigrosAccAverage,
} from '@/features/phigros-best-image/load-phigros-acc-averages';
import {
  buildCustomPhigrosBestImageSections, buildPhigrosNoteTotalByKey,
  DEFAULT_CUSTOM_PHIGROS_BEST_IMAGE_FILTERS,
  isCustomPhigrosBestImageFiltersValid, parseBestImageQuantity,
  parsePhigrosBestImageScoreBound,
  type CustomPhigrosBestImageFilters,
} from '@/features/phigros-best-image/phigros-best-image-custom';
import {
  appendPhigrosOverflowRecords, paginatePhigrosBestImageSections,
  type PhigrosBestImageOverflowCount, type PhigrosBestImageType,
} from '@/features/phigros-best-image/phigros-best-image';
import {
  createPhigrosIllustrationSessionDirectory, disposePhigrosIllustrationSession,
  loadPhigrosIllustrations, loadRemoteImageDataUri, phigrosReadableRootDirectory,
} from '@/features/phigros-best-image/load-phigros-image-assets';
import { partitionPhigrosIllustrationCache } from '@/features/phigros-best-image/phigros-illustration-cache';
import {
  loadPhigrosReferenceTemplateAssets,
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
import { useAppLifecycle } from '@/state/app-lifecycle';
import { providerErrorToUserMessage } from '@/providers/errors';
import { RangeSelector } from '@/components/game-content/RangeSelector';

const WIDTHS = [1080, 1440, 2160] as const;
const OVERFLOW_COUNTS: readonly PhigrosBestImageOverflowCount[] = [0, 3, 6, 9];
const DEFAULT_STYLES: PhigrosBestImageStylePreferences = {
  version: 2, ratingStyle: 'game', avatar: { mode: 'current' }, background: { mode: 'current' }, overflowCount: 0,
};

const phigrosPreferencesAdapter = {
  load: (accountId: string) => phigrosBestImagePreferencesStore.load(accountId),
  save: (accountId: string, prefs: PhigrosBestImageStylePreferences) => phigrosBestImagePreferencesStore.save(accountId, prefs),
};

function LevelFilterChip({ level, selected, onPress }: { level: PhigrosLevel; selected: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  const colors = phigrosLevelColors(level);
  const label = phigrosLevelLabel(level);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`筛选难度 ${label}`}
    onPress={onPress} style={[styles.filterChip, { backgroundColor: colors.bg }, selected && { borderColor: theme.accent }]}>
    <Text style={[styles.filterChipText, { color: colors.fg }]}>{label}</Text>
  </Pressable>;
}

function RankFilterChip({ value, selected, onPress }: { value: PhigrosRankFilter; selected: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  const badgeRate = value === 'fc' ? 'v' : value;
  const badgeFc = value === 'fc';
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`筛选评价 ${phigrosRankFilterLabel(value)}`}
    onPress={onPress} style={[styles.rankChipWrap, selected && { borderColor: theme.accent }]}>
    <PhigrosRateBadge rate={badgeRate} fc={badgeFc} />
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
  const illustrationStageRef = useRef<Directory | null>(null);
  if (illustrationStageRef.current === null) {
    illustrationStageRef.current = createPhigrosIllustrationSessionDirectory();
  }
  const illustrationStage = illustrationStageRef.current;

  useEffect(() => () => {
    disposePhigrosIllustrationSession(illustrationStage);
  }, [illustrationStage]);
  const theme = useAppTheme();
  const lifecycle = useAppLifecycle();
  const gameData = useGameData();
  const catalog = usePhigrosCatalog();
  const payload = gameData.data?.payload.kind === 'phigros' ? gameData.data.payload : null;
  const provider = catalog.data?.provider;
  const songs = useMemo(() => catalog.data?.snapshot.songs ?? [], [catalog.data?.snapshot.songs]);
  const [scoreMinText, setScoreMinText] = useState('');
  const [scoreMaxText, setScoreMaxText] = useState('');
  const [accuracyMinText, setAccuracyMinText] = useState('');
  const [accuracyMaxText, setAccuracyMaxText] = useState('');
  const [customFilters, setCustomFilters] = useState<CustomPhigrosBestImageFilters>(DEFAULT_CUSTOM_PHIGROS_BEST_IMAGE_FILTERS);
  const [avatarItems, setAvatarItems] = useState<string[]>([]);
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
  const illustrationCacheRef = useRef<Record<string, string | null>>({});
  const neededFontEntriesRef = useRef<ReturnType<typeof resolveNeededPhigrosFonts>>([]);
  const styleAssetKeyRef = useRef<string | null>(null);

  const controller = useBestImageScreenController<PhigrosBestImageType, PhigrosBestImageStylePreferences, PhigrosBestImagePickerKind>({
    accountId: gameData.activeAccountId,
    defaultType: 'best30',
    defaultWidth: 1080,
    defaultQuantityText: String(DEFAULT_CUSTOM_PHIGROS_BEST_IMAGE_FILTERS.quantity),
    defaultPreferences: DEFAULT_STYLES,
    preferences: phigrosPreferencesAdapter,
    defaultExportHeight: (width) => Math.ceil(width * 0.75),
    messageScale: 1,
  });
  const {
    width,
    setWidth,
    type,
    setType,
    quantityText,
    setQuantityText,
    prefs: stylePrefs,
    setPrefs: setStylePrefs,
    picker,
    setPicker,
    pageHeights,
    setPageHeights,
    pageIndex,
    setPageIndex,
    setPreviewStates,
    exportIndex,
    exportHeight,
    exportStatus,
    exportCaptureRef,
    exportImages: runExportImages,
    cancelExportRequest,
    handleExportMessage,
    handlePreviewMessage,
  } = controller;

  useEffect(() => {
    if (!provider) { setAvatarItems([]); return; }
    void provider.getGameVersion().then(loadPhigrosAvatarCatalog).then((remote) => {
      setAvatarItems(remote);
    }).catch(() => setAvatarItems([]));
  }, [provider]);
  const noteTotalByKey = useMemo(() => buildPhigrosNoteTotalByKey(songs), [songs]);
  const sections = useMemo(() => {
    if (!payload) return [];
    if (type === 'best30') return appendPhigrosOverflowRecords(payload.bestSections, payload.records, stylePrefs.overflowCount);
    return buildCustomPhigrosBestImageSections(payload.records, customFilters, noteTotalByKey);
  }, [customFilters, noteTotalByKey, payload, stylePrefs.overflowCount, type]);
  const quantityError = parseBestImageQuantity(quantityText) === null ? '数量必须是非负整数，0 表示不限制' : null;
  const scoreMinError = parsePhigrosBestImageScoreBound(scoreMinText) === null ? '分数须在 0–1000000' : null;
  const scoreMaxError = parsePhigrosBestImageScoreBound(scoreMaxText) === null ? '分数须在 0–1000000' : null;
  const customInputValid = isCustomPhigrosBestImageFiltersValid({
    quantityText,
    scoreMin: scoreMinText,
    scoreMax: scoreMaxText,
    accuracyMin: accuracyMinText,
    accuracyMax: accuracyMaxText,
  });
  const formValid = type !== 'custom' || customInputValid;
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
  neededFontEntriesRef.current = neededFontEntries;
  const neededFontKey = neededFontEntries.map((entry) => entry.name).join('|');

  useEffect(() => {
    let cancelled = false;
    setTemplateAssetError(null);
    setFontsReady(false);
    if (!lifecycle.foregroundReady) return;
    const neededNames = neededFontKey ? neededFontKey.split('|').filter(Boolean) : [];
    void (async () => {
      const prepared = await preparePhigrosFonts((progress) => {
        if (!cancelled) setFontProgress(progress);
      }, { neededNames });
      const fullResult = prepared.fullReady.then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      const assets = await loadPhigrosReferenceTemplateAssets(
        phigrosReadableRootDirectory().uri,
        provider?.getAvatarUrl('Introduction') ?? '',
      );
      const trimmedAssets = {
        ...assets,
        css: trimPhigrosBestImageCss(assets.css, neededFontEntriesRef.current),
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
      if (!cancelled) setTemplateAssetError(providerErrorToUserMessage(error, '无法准备成绩图片，请重试。'));
    });
    return () => { cancelled = true; };
  }, [fontAttempt, lifecycle.foregroundGeneration, lifecycle.foregroundReady, neededFontKey, provider]);
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
    if (!payload || !lifecycle.foregroundReady) return;
    void loadPhigrosAccAverages(averageRecords, averageReferenceRks).then((averages) => {
      if (!cancelled) setAccAverages(averages);
    });
    return () => { cancelled = true; };
  }, [averageRecords, averageReferenceRks, lifecycle.foregroundGeneration, lifecycle.foregroundReady, payload]);

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
  const backgroundFallbackSongId = selectedSongIds[0] ?? null;
  const styleAssetKey = [
    stylePrefs.avatar.mode, avatarKey ?? '', stylePrefs.background.mode, backgroundKey ?? '', backgroundFallbackSongId ?? '', payload?.avatarUrl ?? '',
  ].join('|');

  useEffect(() => {
    let cancelled = false;
    if (!provider || !lifecycle.foregroundReady) return;
    const uniqueIds = [...new Set(selectedSongIds)];
    const { next, missing } = partitionPhigrosIllustrationCache(uniqueIds, illustrationCacheRef.current);
    // 先用缓存命中结果立刻出预览，缺失曲目先回退占位，避免切换时整页清空。
    // 只保留当前选中曲目，避免切换筛选时 session 缓存只增不减。
    illustrationCacheRef.current = next;
    setIllustrations(next);
    setAssetProgress({ done: uniqueIds.length - missing.length, total: uniqueIds.length });
    if (!missing.length) return;
    void loadPhigrosIllustrations(missing, (id) => provider.getIllustrationLowresUrl(id), (done) => {
      if (!cancelled) setAssetProgress({ done: uniqueIds.length - missing.length + done, total: uniqueIds.length });
    }, illustrationStage).then((loaded) => {
      if (cancelled) return;
      const merged = Object.fromEntries(uniqueIds.map((id) => [id, loaded[id] ?? illustrationCacheRef.current[id] ?? null]));
      illustrationCacheRef.current = merged;
      setIllustrations(merged);
      setAssetProgress({ done: uniqueIds.length, total: uniqueIds.length });
    });
    return () => { cancelled = true; };
    // selectedSongKey 是 selectedSongIds.join('|') 的派生签名：ids 内容任何变化必然
    // ids 与 key 来自同一次渲染，避免写入错误的素材会话。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [illustrationStage, lifecycle.foregroundGeneration, lifecycle.foregroundReady, provider, selectedSongKey]);

  useEffect(() => {
    let cancelled = false;
    if (!provider || !lifecycle.foregroundReady) return;
    if (styleAssetKeyRef.current === styleAssetKey) return;
    void Promise.all([
      stylePrefs.avatar.mode === 'off' ? Promise.resolve(null) : (async () => (
        await loadRemoteImageDataUri(avatarKey ? provider.getAvatarUrl(avatarKey) : payload?.avatarUrl, illustrationStage)
        ?? await loadRemoteImageDataUri(payload?.avatarUrl, illustrationStage)
      ))(),
      stylePrefs.background.mode === 'off' ? Promise.resolve(null) : (async () => (
        await loadRemoteImageDataUri(backgroundKey ? provider.getIllustrationBlurUrl(backgroundKey) : null, illustrationStage)
        ?? await loadRemoteImageDataUri(backgroundFallbackSongId ? provider.getIllustrationBlurUrl(backgroundFallbackSongId) : null, illustrationStage)
      ))(),
    ]).then(([nextAvatar, nextBackground]) => {
      if (cancelled) return;
      styleAssetKeyRef.current = styleAssetKey;
      setAvatarData(nextAvatar ?? null);
      setBackgroundData(nextBackground ?? null);
    });
    return () => { cancelled = true; };
  }, [
    avatarKey, backgroundFallbackSongId, backgroundKey, illustrationStage, lifecycle.foregroundGeneration,
    lifecycle.foregroundReady, payload?.avatarUrl, provider,
    styleAssetKey, stylePrefs.avatar.mode, stylePrefs.background.mode,
  ]);

  const htmlPages = useMemo(() => payload && illustrations && accAverages && templateAssets ? pages.map((page) => {
    // 分辨率选项由 WIDTHS 固定枚举，此处收窄回模板所需的字面量联合（纯类型断言）。
    const outputWidth = width as (typeof WIDTHS)[number];
    const input = {
      type, width: outputWidth, page, playerName: payload.player.displayName, rks: payload.playerScore.display,
      dataAmount: payload.dataAmount,
      challenge: formatPhigrosChallengeBadge(payload.challengeModeRank), challengeModeRank: payload.challengeModeRank,
      syncedAt: formatSyncTime(payload.saveUpdatedAt),
      progress: payload.progress, titles, illustrations, accAverages, avatarDataUri: avatarData, backgroundDataUri: backgroundData,
      templateAssets,
    };
    return stylePrefs.ratingStyle === 'app'
      ? buildPhigrosBestImageAppHtml(input)
      : buildPhigrosBestImageHtml(input);
  }) : null, [accAverages, avatarData, backgroundData, illustrations, pages, payload, stylePrefs.ratingStyle, templateAssets, titles, type, width]);

  useEffect(() => {
    setPageHeights({}); setPageIndex(0); setPreviewStates({});
    if (!htmlPages || !fontDirectory) {
      setSources(null);
      return;
    }
    const prepared = prepareBestImageWebViewSources(htmlPages, fontDirectory);
    setSources(prepared.sources);
    return prepared.dispose;
  }, [fontDirectory, htmlPages, setPageHeights, setPageIndex, setPreviewStates]);

  const currentPage = pages[Math.min(pageIndex, pages.length - 1)]!;
  const outputHeight = pageHeights[currentPage.id] ?? Math.ceil(width * .75);
  const avatarPickerItems = useMemo<PhigrosBestImagePickerItem[]>(() => avatarItems.flatMap((key) => {
    const remoteUrl = provider?.getAvatarUrl(key);
    return remoteUrl ? [{ key, label: key, meta: '头像', source: { uri: remoteUrl } }] : [];
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
  const exportImages = () => runExportImages({
    pages,
    htmlPages,
    sources,
    canExport: !!payload && fontsReady && formValid,
    buildExportFilename: (index, pageCount) => bestImageExportFilename(payload!.player.displayName, type, index, pageCount),
  });

  if (!payload && !gameData.isLoading) return <View style={[styles.center, { backgroundColor: theme.background }]}><Text style={{ color: theme.textMuted }}>当前账号没有可生成的 Phigros 成绩</Text></View>;
  return <BestImageScreenShell
    imageTypes={[{ id: 'best30', label: 'Best30' }, { id: 'custom', label: '自定义' }] as const}
    activeType={type}
    onSelectType={(id) => {
      startTransition(() => setType(id));
    }}
    customPanelBody={type === 'custom' ? <>
      <View style={styles.textFieldWrap}>
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>数量</Text>
        <TextInput accessibilityLabel="自定义数量" autoCorrect={false} keyboardType="number-pad" value={quantityText} onChangeText={(value) => {
          setQuantityText(value);
          const parsed = parseBestImageQuantity(value);
          if (parsed !== null) setCustomFilters((current) => ({ ...current, quantity: parsed }));
        }} placeholder="0 为无限制" placeholderTextColor={theme.textMuted} style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }, quantityError && styles.textInputError]} />
        {quantityError ? <Text style={[styles.errorText, { color: theme.danger }]}>{quantityError}</Text> : null}
      </View>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>难度</Text>
      <View style={styles.chipRow}>
        <BestImageChoiceChip label="全部" accessibilityLabel="筛选难度 全部" selected={customFilters.level === 'all'} onPress={() => setCustomFilters((current) => ({ ...current, level: 'all' }))} styles={{ chip: styles.chip, chipText: styles.chipText }} />
        {PHIGROS_LEVELS.map((level) => (
          <LevelFilterChip key={level} level={level} selected={customFilters.level === level} onPress={() => setCustomFilters((current) => ({ ...current, level }))} />
        ))}
      </View>
      <View style={styles.fieldRow}>
        <View style={styles.textFieldWrap}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>分数</Text>
          <View style={styles.rangeRow}>
            <TextInput accessibilityLabel="最低分数" autoCorrect={false} keyboardType="number-pad" value={scoreMinText} onChangeText={(value) => {
              setScoreMinText(value);
              if (parsePhigrosBestImageScoreBound(value) !== null) setCustomFilters((current) => ({ ...current, scoreMin: value }));
            }} placeholder="下限" placeholderTextColor={theme.textMuted} style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }, scoreMinError && styles.textInputError]} />
            <Text style={[styles.rangeSeparator, { color: theme.textMuted }]}>~</Text>
            <TextInput accessibilityLabel="最高分数" autoCorrect={false} keyboardType="number-pad" value={scoreMaxText} onChangeText={(value) => {
              setScoreMaxText(value);
              if (parsePhigrosBestImageScoreBound(value) !== null) setCustomFilters((current) => ({ ...current, scoreMax: value }));
            }} placeholder="上限" placeholderTextColor={theme.textMuted} style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }, scoreMaxError && styles.textInputError]} />
          </View>
          {scoreMinError || scoreMaxError ? <Text style={[styles.errorText, { color: theme.danger }]}>{scoreMinError ?? scoreMaxError}</Text> : null}
        </View>
        <View style={styles.textFieldWrap}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Acc</Text>
          <RangeSelector accessibilityLabel="Phigros 成绩图 Acc 范围" minimum={0} maximum={100} step={0.01}
            lowerValue={accuracyMinText} upperValue={accuracyMaxText}
            onLowerValueChange={(value) => {
              setAccuracyMinText(value);
              setCustomFilters((current) => ({ ...current, accuracyMin: value }));
            }}
            onUpperValueChange={(value) => {
              setAccuracyMaxText(value);
              setCustomFilters((current) => ({ ...current, accuracyMax: value }));
            }}
            formatValue={(value) => `${value.toFixed(2)}%`} testID="phigros-best-image-accuracy-range" />
        </View>
      </View>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>评价</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <BestImageChoiceChip label="全部" accessibilityLabel="筛选评价 全部" selected={customFilters.rank === null} onPress={() => setCustomFilters((current) => ({ ...current, rank: null }))} styles={{ chip: styles.chip, chipText: styles.chipText }} />
        {PHIGROS_RANK_FILTERS.map((item) => (
          <RankFilterChip key={item.value} value={item.value} selected={customFilters.rank === item.value} onPress={() => setCustomFilters((current) => ({ ...current, rank: item.value }))} />
        ))}
      </ScrollView>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>XING</Text>
      <View style={styles.chipRow}>
        <BestImageChoiceChip
          label="关闭"
          accessibilityLabel="XING 筛选 关闭"
          selected={customFilters.xing === null}
          onPress={() => setCustomFilters((current) => ({ ...current, xing: null }))}
          styles={{ chip: styles.chip, chipText: styles.chipText }}
        />
        {([
          { value: 'good' as const, label: 'Good' },
          { value: 'miss' as const, label: 'Miss' },
        ] satisfies { value: PhigrosXingKind; label: string }[]).map((item) => (
          <BestImageChoiceChip
            key={item.value}
            label={item.label}
            accessibilityLabel={`XING 筛选 ${item.label}`}
            selected={customFilters.xing === item.value}
            onPress={() => setCustomFilters((current) => ({ ...current, xing: item.value }))}
            styles={{ chip: styles.chip, chipText: styles.chipText }}
          />
        ))}
      </View>
    </> : null}
    styleListHeader={<>
      <View style={[styles.ratingStyleRow, { borderBottomColor: theme.border }]}>
        <View accessibilityRole="tablist" style={[styles.segmentedControl, { backgroundColor: theme.surfaceMuted }]}>
          {([{ id: 'game', label: '游戏风格' }, { id: 'app', label: '应用风格' }] as const).map(({ id, label }) => {
            const selected = stylePrefs.ratingStyle === id;
            return <Pressable key={id} accessibilityLabel={label} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setStylePrefs((current) => ({ ...current, ratingStyle: id }))} style={[styles.segment, selected && { backgroundColor: theme.surface }]}>
              <Text style={[styles.segmentText, { color: theme.textMuted }, selected && { color: theme.accent }]}>{label}</Text>
            </Pressable>;
          })}
        </View>
      </View>
      {type === 'best30' ? <View style={[styles.overflowStyleRow, { borderBottomColor: theme.border }]}>
        <View style={styles.overflowCopy}><Text style={[styles.styleName, { color: theme.text }]}>OVER FLOW</Text><Text style={[styles.styleValue, { color: theme.textMuted }]}>追加成绩数量</Text></View>
        <View style={styles.overflowChoices}>{OVERFLOW_COUNTS.map((count) => <BestImageChoiceChip key={count} label={`${count} 个`} selected={stylePrefs.overflowCount === count} onPress={() => setStylePrefs((current) => ({ ...current, overflowCount: count }))} styles={{ chip: styles.chip, chipText: styles.chipText }} />)}</View>
      </View> : null}
    </>}
    styleRows={(['avatar', 'background'] as const).map((kind) => <Pressable key={kind} accessibilityRole="button" accessibilityLabel={`选择${kind === 'avatar' ? '头像' : '背景'}`} onPress={() => setPicker(kind)} style={({ pressed }) => [styles.styleRow, { borderBottomColor: theme.border }, pressed && { backgroundColor: theme.surfaceMuted }]}>
      <View style={styles.stylePreview}>{kind === 'avatar' ? (avatarData ? <Image source={{ uri: avatarData }} style={styles.avatarPreview} /> : <Text style={[styles.noAsset, { color: theme.textMuted }]}>未设置</Text>) : (backgroundData ? <Image source={{ uri: backgroundData }} style={styles.backgroundPreview} /> : <Text style={[styles.noAsset, { color: theme.textMuted }]}>未设置</Text>)}</View>
      <View style={styles.styleCopy}><Text style={[styles.styleName, { color: theme.text }]}>{kind === 'avatar' ? '头像' : '背景'}</Text><Text numberOfLines={1} style={[styles.styleValue, { color: theme.textMuted }]}>{styleValue(kind)}</Text></View>
      <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
    </Pressable>)}
    widths={WIDTHS}
    activeWidth={width}
    onChooseWidth={setWidth}
    dimensionMeta={`${width} × ${outputHeight} px · 每页最多 ${type === 'best30' ? 30 + stylePrefs.overflowCount : 30} 张 · 第 ${pageIndex + 1}/${pages.length} 页`}
    previewTestIdPrefix="phigros-best-image"
    sources={sources}
    pages={pages}
    pageIndex={pageIndex}
    onPageIndexChange={setPageIndex}
    onPreviewStatesChange={setPreviewStates}
    onPreviewMessage={handlePreviewMessage}
    fileAccessFromFileURLs
    allowingReadAccessToUrl={templateAssets?.allowingReadAccessToUrl}
    loadingPreview={templateAssetError ? <View style={styles.loadingContent}><Text accessibilityRole="alert" style={[styles.assetError, { color: theme.danger }]}>{templateAssetError}</Text><Pressable accessibilityRole="button" accessibilityLabel="重试字体下载" onPress={() => setFontAttempt((value) => value + 1)} style={[styles.retryButton, { borderColor: theme.accent }]}><Text style={[styles.retryButtonText, { color: theme.accent }]}>重试</Text></Pressable></View> : <View style={styles.loadingContent}><ActivityIndicator accessibilityLabel="正在准备预览" color={theme.accent} size="large" /><Text style={[styles.loadingText, { color: theme.textMuted }]}>{!templateAssets ? fontProgressLabel(fontProgress) : assetProgress.total > 0 ? `正在准备歌曲封面 ${assetProgress.done}/${assetProgress.total}` : '正在准备预览'}</Text></View>}
    fontStatus={sources && !fontsReady ? <View accessibilityLiveRegion="polite" style={[styles.fontStatus, { backgroundColor: theme.surface, borderColor: templateAssetError ? theme.danger : theme.border }]}>{templateAssetError ? <><Text accessibilityRole="alert" style={[styles.fontStatusText, { color: theme.danger }]}>{templateAssetError}</Text><Pressable accessibilityRole="button" accessibilityLabel="重试字体下载" onPress={() => setFontAttempt((value) => value + 1)} style={[styles.retryButton, { borderColor: theme.accent }]}><Text style={[styles.retryButtonText, { color: theme.accent }]}>重试</Text></Pressable></> : <><ActivityIndicator color={theme.accent} size="small" /><Text style={[styles.fontStatusText, { color: theme.textMuted }]}>{fontProgressLabel(fontProgress)}；所需字体完成后可导出</Text></>}</View> : null}
    fontStatusAboveDots
    exportDisabled={!sources || !fontsReady || !formValid || !!exportStatus}
    exportSpinner={exportStatus !== null}
    exportIdleLabel={fontsReady ? '导出到相册' : '所需字体准备完成后可导出'}
    exportStatus={exportStatus}
    onExport={() => void exportImages()}
    exportIndex={exportIndex}
    exportHeight={exportHeight}
    exportSource={exportIndex !== null && sources?.[exportIndex] ? sources[exportIndex]! : null}
    exportWebViewKeyPrefix="phi-export"
    captureRef={exportCaptureRef}
    captureAccessibilityLabel={exportIndex !== null ? `导出画布 第${exportIndex + 1}页` : undefined}
    onExportMessage={handleExportMessage}
    onRequestCloseExport={cancelExportRequest}
    onReleaseHeavySources={() => {
      setSources(null);
      setIllustrations(null);
      setAccAverages(null);
      setAvatarData(null);
      setBackgroundData(null);
      setTemplateAssets(null);
      illustrationCacheRef.current = {};
      styleAssetKeyRef.current = null;
    }}
    pickers={<PhigrosBestImageStylePicker visible={picker !== null} kind={picker} items={pickerItems} selection={picker ? stylePrefs[picker] : null} onClose={() => setPicker(null)} onSelect={chooseStyle} />}
    styles={styles}
  />;
}

const phigrosStyles = StyleSheet.create({
  // Phigros 差异键：数量输入行（textFieldWrap 无 minWidth）、错误文案、chip 行
  // 带居中、分数/Acc 区间输入、难度/评价筛选 chip、头像/背景预览尺寸、
  // 素材错误/重试、素材状态条、空数据居中容器。
  textFieldWrap: { flex: 1, gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700' },
  errorText: { fontSize: 11, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rangeInput: { flex: 1, minHeight: 40, paddingHorizontal: 10, borderWidth: 1, borderRadius: 10, fontSize: 14 },
  rangeSeparator: { fontSize: 13, fontWeight: '700' },
  filterChip: { minHeight: 28, minWidth: 36, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  filterChipText: { fontSize: 12, fontWeight: '800' },
  rankChipWrap: { borderWidth: 2, borderColor: 'transparent', borderRadius: 10, padding: 2 },
  avatarPreview: { width: 46, height: 46, borderRadius: 10 },
  backgroundPreview: { width: 132, height: 46, borderRadius: 8 },
  assetError: { paddingHorizontal: 20, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  fontStatus: { minHeight: 44, marginTop: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  fontStatusText: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
  retryButton: { minHeight: 32, minWidth: 68, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 999 },
  retryButtonText: { fontSize: 12, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
});

/** 共享骨架样式 + Phigros 差异覆盖。 */
const styles = { ...bestImageScreenSharedStyles, ...phigrosStyles };

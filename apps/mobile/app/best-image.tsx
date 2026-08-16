import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSession } from '@/state/session-store';
import { useGameData } from '@/hooks/use-game-data';
import { useAppTheme } from '@/theme/app-theme';
import { CollectionImage } from '@/components/CollectionImage';
import type { ChartType, Difficulty, Player } from '@/domain/models';
import { MaimaiFilterBar, formatDxRatingTagFilterValue, type VersionFilterOption } from '@/components/MaimaiFilterBar';
import { buildDxRatingChartTagIndex } from '@/domain/dxrating-chart-tags';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useDxRatingChartTags } from '@/hooks/use-dxrating-chart-tags';
import { localizedVersionName, type VersionNameLocale } from '@/domain/version-names';
import { DIFFICULTY_VISUAL } from '@/components/ScoreVisuals';
import {
  maimaiFcAchievementLabel,
  maimaiFsAchievementLabel,
  type MaimaiFcAchievement,
  type MaimaiFsAchievement,
} from '@/domain/maimai-filters';
import {
  buildBestImageHtml,
  minimumBestImageHeight,
  ratingFrameIndex,
  type BestImageScoreSection,
  type BestImageType,
} from '@/features/best-image/build-best-image-html';
import { BEST_IMAGE_WEBVIEW_PHASE_LABELS, useBestImageWebViewTimeout } from '@/features/best-image/best-image-webview-state';
import {
  buildCustomBestImageSections,
  DEFAULT_CUSTOM_BEST_IMAGE_FILTERS,
  maximumBestImageRowsForWidth,
  paginateBestImageSections,
  parseBestImageQuantity,
} from '@/features/best-image/best-image-custom';
import {
  loadBestImageAssets,
  type BestImageEmbeddedAssets,
} from '@/features/best-image/load-best-image-assets';
import {
  BestImageCollectionPicker,
  TrophyPreview,
} from '@/features/best-image/best-image-collection-picker';
import {
  bestImageStylePreferencesStore,
  type AppliedBestImageStyleSelection,
  type BestImageCollectionChoice,
  type BestImageCollectionKind,
  type BestImageRatingStyle,
  type BestImageStyleSelections,
} from '@/features/best-image/best-image-style-preferences';
import {
  BestImageChoiceChip,
  BestImageScreenShell,
  bestImageScreenSharedStyles,
} from '@/features/best-image/best-image-screen-shell';
import { useBestImageScreenController } from '@/features/best-image/use-best-image-screen-controller';
import { useBestImageCollections } from '@/features/best-image/use-best-image-collections';
import { loadBestImageJackets } from '@/features/best-image/load-best-image-jackets';
import { bestImageExportFilename } from '@/features/best-image/best-image-export';
import {
  prepareBestImageWebViewSources,
  type BestImageWebViewSource,
} from '@/features/best-image/prepare-best-image-webview-sources';
import {
  prepareMaimaiFonts,
  type MaimaiFontProgress,
} from '@/features/best-image/maimai-font-cache';
import {
  prepareMaimaiUi,
  type MaimaiUiProgress,
} from '@/features/best-image/maimai-ui-cache';
import { ChunithmBestImageScreen } from '@/screens/ChunithmBestImageScreen';
import { PhigrosBestImageScreen } from '@/screens/PhigrosBestImageScreen';
import type { Directory } from 'expo-file-system';

const IMAGE_TYPES: { id: BestImageType; label: string }[] = [
  { id: 'best50', label: 'Best50' },
  { id: 'custom', label: '自定义' },
];
const RATING_STYLES: { id: BestImageRatingStyle; label: string }[] = [
  { id: 'game', label: '游戏风格' },
  { id: 'app', label: '应用风格' },
];
const OUTPUT_WIDTHS = [1080, 1440, 2160] as const;
const STYLE_ITEMS: { kind: BestImageCollectionKind; label: string }[] = [
  { kind: 'icon', label: '头像' },
  { kind: 'plate', label: '姓名框' },
  { kind: 'trophy', label: '称号' },
  { kind: 'frame', label: '背景' },
];
const FALLBACK_PLAYER: Pick<Player, 'displayName' | 'presentation' | 'extension' | 'additionalRating'> = {
  displayName: '未读取玩家资料',
  presentation: undefined,
};
const FONT_SOURCE = require('../assets/rating/ariblk.ttf') as number;
const RATING_FRAME_SOURCES: number[] = [
  require('../assets/rating/rating_base_01.png'),
  require('../assets/rating/rating_base_02.png'),
  require('../assets/rating/rating_base_03.png'),
  require('../assets/rating/rating_base_04.png'),
  require('../assets/rating/rating_base_05.png'),
  require('../assets/rating/rating_base_06.png'),
  require('../assets/rating/rating_base_07.png'),
  require('../assets/rating/rating_base_08.png'),
  require('../assets/rating/rating_base_09.png'),
  require('../assets/rating/rating_base_10.png'),
  require('../assets/rating/rating_base_11.png'),
];

const FONT_PROGRESS_LABELS: Record<MaimaiFontProgress['phase'], string> = {
  checking: '正在检查导出字体',
  downloading: '正在下载导出字体',
  ready: '导出字体准备完成',
  error: '导出字体准备失败',
};

/** 控制器偏好对象与舞萌 P2 store 的适配（save 保持原 .catch 吞错语义）。 */
type MaimaiBestImagePrefs = { selections: BestImageStyleSelections; ratingStyle: BestImageRatingStyle };
const maimaiPreferencesAdapter = {
  load: (accountId: string) => bestImageStylePreferencesStore.load(accountId).then((preferences) => ({
    selections: preferences.selections,
    ratingStyle: preferences.ratingStyle,
  })),
  save: (accountId: string, prefs: MaimaiBestImagePrefs) => bestImageStylePreferencesStore
    .save(accountId, prefs.selections, prefs.ratingStyle)
    .catch(() => undefined),
};

function StylePreview({
  kind,
  selection,
  player,
}: {
  kind: BestImageCollectionKind;
  selection?: AppliedBestImageStyleSelection;
  player: Pick<Player, 'displayName' | 'presentation'>;
}) {
  const theme = useAppTheme();
  if (selection?.mode === 'off') return <Text style={[styles.noAsset, { color: theme.textMuted }]}>已关闭</Text>;
  const selectedItem = selection?.mode === 'item' || selection?.mode === 'random' ? selection.item : undefined;
  if (kind === 'trophy') {
    return <TrophyPreview item={selectedItem} fallback={player.presentation?.trophyName} />;
  }
  const collectionId = selectedItem?.id ?? ({
    icon: player.presentation?.iconId,
    plate: player.presentation?.namePlateId,
    frame: player.presentation?.frameId,
  } as const)[kind];
  if (collectionId === undefined) return <Text style={[styles.noAsset, { color: theme.textMuted }]}>未设置</Text>;
  return <CollectionImage kind={kind} collectionId={collectionId} size={kind === 'plate' ? 18 : 44} borderRadius={kind === 'plate' ? 4 : 10} />;
}

export default function BestImageScreen() {
  const activeGameId = useSession((state) => state.activeGameId);
  if (activeGameId === 'chunithm') return <ChunithmBestImageScreen />;
  if (activeGameId === 'phigros') return <PhigrosBestImageScreen />;
  return <MaimaiBestImageScreen />;
}

export function MaimaiBestImageScreen() {
  const theme = useAppTheme();
  const { data, activeAccountId } = useGameData();
  const [embeddedAssets, setEmbeddedAssets] = useState<BestImageEmbeddedAssets | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [coverUrls, setCoverUrls] = useState<Record<string, string | null> | null>(null);
  const [coverProgress, setCoverProgress] = useState({ completed: 0, total: 0 });
  const [quantity, setQuantity] = useState(DEFAULT_CUSTOM_BEST_IMAGE_FILTERS.quantity);
  const [versions, setVersions] = useState<string[]>([]);
  const [splitVersions, setSplitVersions] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [type, setType] = useState<ChartType | 'all'>('all');
  const [constantMin, setConstantMin] = useState('');
  const [constantMax, setConstantMax] = useState('');
  const [achievementMin, setAchievementMin] = useState('');
  const [achievementMax, setAchievementMax] = useState('');
  const [soloAchievement, setSoloAchievement] = useState<MaimaiFcAchievement | null>(null);
  const [multiAchievement, setMultiAchievement] = useState<MaimaiFsAchievement | null>(null);
  const [strictAchievement, setStrictAchievement] = useState(false);
  const [nearMiss, setNearMiss] = useState(false);
  const [versionLocale, setVersionLocale] = useState<VersionNameLocale>('china');
  const [selectedDxRatingTagIds, setSelectedDxRatingTagIds] = useState<number[]>([]);
  const [webViewSources, setWebViewSources] = useState<BestImageWebViewSource[] | null>(null);
  const [webViewSourceError, setWebViewSourceError] = useState<string | null>(null);
  const [fontAttempt, setFontAttempt] = useState(0);
  const [assetsDirectory, setAssetsDirectory] = useState<Directory | null>(null);
  const [assetsReady, setAssetsReady] = useState(false);
  const [fontProgress, setFontProgress] = useState<MaimaiFontProgress>({ phase: 'checking', completed: 0, total: 1, currentFont: null });
  const [uiProgress, setUiProgress] = useState<MaimaiUiProgress>({ phase: 'checking', completed: 0, total: 1, currentEntry: null });
  const [exportAssetError, setExportAssetError] = useState<string | null>(null);
  const randomizedSelections = useRef(new Set<string>());
  const collections = useBestImageCollections();
  const maimai = data?.payload.kind === 'maimai' ? data.payload : null;
  const player = maimai?.player;
  const basePlayer = player ?? FALLBACK_PLAYER;
  const rating = maimai?.playerScore.value ?? 0;
  const frameSource = RATING_FRAME_SOURCES[ratingFrameIndex(rating)]!;

  const controller = useBestImageScreenController<BestImageType, MaimaiBestImagePrefs, BestImageCollectionKind>(
    {
      accountId: activeAccountId,
      defaultType: 'best50',
      defaultWidth: 1080,
      defaultQuantityText: String(DEFAULT_CUSTOM_BEST_IMAGE_FILTERS.quantity),
      defaultPreferences: { selections: {}, ratingStyle: 'game' },
      preferences: maimaiPreferencesAdapter,
      onPreferencesLoadStart: () => { randomizedSelections.current.clear(); },
      defaultExportHeight: minimumBestImageHeight,
      wrapExportPageError: true,
      exportBusyIncludesIndex: true,
      previewRenderingGuard: true,
    },
  );
  const {
    width: outputWidth,
    type: imageType,
    quantityText,
    prefs,
    prefsReady: stylePreferencesReady,
    setPrefs,
    picker: activePicker,
    setPicker: setActivePicker,
    pageHeights,
    setPageHeights,
    pageIndex: currentPageIndex,
    setPageIndex: setCurrentPageIndex,
    previewStates: webViewStates,
    setPreviewStates: setWebViewStates,
    exportIndex: exportPageIndex,
    exportHeight,
    exportStatus,
    exportCaptureRef,
    exportImages: runExportImages,
    cancelExportRequest,
    handleExportMessage,
    handlePreviewMessage,
  } = controller;
  const { selections: styleSelections, ratingStyle } = prefs;
  const setRatingStyle = (nextRatingStyle: BestImageRatingStyle) => {
    setPrefs((current) => ({ ...current, ratingStyle: nextRatingStyle }));
  };

  useEffect(() => {
    let cancelled = false;
    setEmbeddedAssets(null);
    setExportAssetError(null);
    loadBestImageAssets(FONT_SOURCE, frameSource).then(
      (assets) => { if (!cancelled) setEmbeddedAssets(assets); },
      () => { if (!cancelled) setAssetError('字体或 Rating 框加载失败'); },
    );
    return () => { cancelled = true; };
  }, [frameSource]);

  useEffect(() => {
    let cancelled = false;
    setExportAssetError(null);
    setAssetsReady(false);
    setWebViewSources(null);
    void (async () => {
      const [font, ui] = await Promise.all([
        prepareMaimaiFonts((progress) => { if (!cancelled) setFontProgress(progress); }),
        prepareMaimaiUi((progress) => { if (!cancelled) setUiProgress(progress); }),
      ]);
      const results = await Promise.allSettled([font.fullReady, ui.fullReady]);
      const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failed) throw failed.reason;
      if (!cancelled) {
        setAssetsDirectory(font.directory);
        setAssetsReady(true);
      }
    })().catch((error) => {
      if (!cancelled) setExportAssetError(error instanceof Error ? error.message : '无法加载导出素材');
    });
    return () => { cancelled = true; };
  }, [fontAttempt]);

  useEffect(() => {
    const items = collections.data?.items;
    if (!stylePreferencesReady || !items) return;
    const needsUpdate = STYLE_ITEMS.some(({ kind }) => {
      const selection = styleSelections[kind];
      if (selection?.mode === 'item') return !items.some((item) => item.kind === kind && item.id === selection.item.id);
      if (selection?.mode !== 'random') return false;
      return !randomizedSelections.current.has(`${activeAccountId ?? 'local-preview'}:${kind}`);
    });
    if (!needsUpdate) return;
    setPrefs((current) => {
      const next = { ...current.selections };
      let changed = false;
      for (const { kind } of STYLE_ITEMS) {
        const selection = current.selections[kind];
        if (selection?.mode === 'item' && !items.some((item) => item.kind === kind && item.id === selection.item.id)) {
          delete next[kind];
          changed = true;
          continue;
        }
        if (selection?.mode !== 'random') continue;
        const randomKey = `${activeAccountId ?? 'local-preview'}:${kind}`;
        if (randomizedSelections.current.has(randomKey)) continue;
        randomizedSelections.current.add(randomKey);
        const candidates = items.filter((item) => item.kind === kind);
        const item = candidates[Math.floor(Math.random() * candidates.length)];
        if (item) {
          next[kind] = { mode: 'random', item };
          changed = true;
        } else {
          delete next[kind];
          changed = true;
        }
      }
      return changed ? { ...current, selections: next } : current;
    });
  }, [activeAccountId, collections.data?.items, prefs, setPrefs, stylePreferencesReady, styleSelections]);

  const previewPlayer = useMemo(() => ({
    displayName: basePlayer.displayName,
    additionalRating: basePlayer.additionalRating,
    extension: basePlayer.extension,
    presentation: {
      ...basePlayer.presentation,
      iconId: styleSelections.icon?.mode === 'item' || styleSelections.icon?.mode === 'random' ? styleSelections.icon.item.id : basePlayer.presentation?.iconId,
      namePlateId: styleSelections.plate?.mode === 'item' || styleSelections.plate?.mode === 'random' ? styleSelections.plate.item.id : basePlayer.presentation?.namePlateId,
      frameId: styleSelections.frame?.mode === 'item' || styleSelections.frame?.mode === 'random' ? styleSelections.frame.item.id : basePlayer.presentation?.frameId,
      trophyName: styleSelections.trophy?.mode === 'item' || styleSelections.trophy?.mode === 'random' ? styleSelections.trophy.item.name : basePlayer.presentation?.trophyName,
      trophyColor: styleSelections.trophy?.mode === 'item' || styleSelections.trophy?.mode === 'random' ? styleSelections.trophy.item.color : basePlayer.presentation?.trophyColor,
    },
  }), [basePlayer, styleSelections]);
  const hiddenStyles = useMemo(() => STYLE_ITEMS.filter(({ kind }) => styleSelections[kind]?.mode === 'off').map(({ kind }) => kind), [styleSelections]);
  const quantityError = parseBestImageQuantity(quantityText) === null ? '数量必须是非负整数，0 表示不限制' : null;
  const customInputValid = !quantityError && versions.length > 0;
  const hasAchievementFilter = soloAchievement !== null || multiAchievement !== null;

  const dxRatingChartTags = useDxRatingChartTags();
  const catalog = useDetailedCatalog();
  const dxRatingTagIndex = useMemo(() => buildDxRatingChartTagIndex(
    dxRatingChartTags.data,
    catalog.data?.songs ?? [],
  ), [catalog.data?.songs, dxRatingChartTags.data]);

  const versionOptions = useMemo<VersionFilterOption[]>(() => {
    if (!maimai) return [];
    return Array.from(new Set(maimai.records.map((record) => record.version))).sort()
      .map((name) => ({ value: name, name }));
  }, [maimai]);
  const versionLabels = useMemo(() => Object.fromEntries(
    versionOptions.map((option) => [option.value, localizedVersionName(option.versionId, option.name, versionLocale)]),
  ), [versionLocale, versionOptions]);

  const versionsInitializedRef = useRef<string | null>(null);
  useEffect(() => {
    if (versionOptions.length === 0) return;
    if (versionsInitializedRef.current === activeAccountId) return;
    versionsInitializedRef.current = activeAccountId;
    setVersions(versionOptions.map((option) => option.value));
    setSplitVersions(false);
  }, [activeAccountId, versionOptions]);

  /** 单个非数量条件时标题为「{条件}N」；多个条件时标题为「自定义N」并附小字提示。 */
  const versionConditionLabel = useMemo(() => {
    if (versions.length === 0) return null;
    if (versions.length === versionOptions.length) return null;
    if (versions.length === 1) return versionLabels[versions[0]!] ?? versions[0];
    return `${versions.length} 个版本`;
  }, [versionLabels, versionOptions.length, versions]);

  const conditionLabels = useMemo(() => {
    const labels: string[] = [];
    if (difficulty !== 'all') labels.push(DIFFICULTY_VISUAL[difficulty].label);
    if (type !== 'all') labels.push(type);
    if (constantMin || constantMax) labels.push(`定数 ${constantMin || '不限'}~${constantMax || '不限'}`);
    if (achievementMin || achievementMax) labels.push(`达成率 ${achievementMin || '不限'}~${achievementMax || '不限'}%`);
    if (soloAchievement) labels.push(`单人 ${maimaiFcAchievementLabel(soloAchievement)}`);
    if (multiAchievement) labels.push(`多人 ${maimaiFsAchievementLabel(multiAchievement)}`);
    if (selectedDxRatingTagIds.length > 0) labels.push(`标签 ${formatDxRatingTagFilterValue(dxRatingChartTags.data?.tags ?? [], selectedDxRatingTagIds)}`);
    if (nearMiss) labels.push('寸');
    if (strictAchievement) labels.push('严格');
    return labels;
  }, [achievementMax, achievementMin, constantMax, constantMin, difficulty, dxRatingChartTags.data?.tags, multiAchievement, nearMiss, selectedDxRatingTagIds, soloAchievement, strictAchievement, type]);

  const customSections = useMemo(() => buildCustomBestImageSections(
    maimai?.records ?? [],
    {
      quantity,
      versions,
      splitVersions,
      difficulty,
      type,
      constantMin,
      constantMax,
      achievementMin,
      achievementMax,
      soloAchievement,
      multiAchievement,
      strictAchievement,
      nearMiss,
      selectedDxRatingTagIds,
      dxRatingTagIndex,
      versionLabels,
      conditionLabels,
      versionConditionLabel,
    },
  ), [achievementMax, achievementMin, conditionLabels, constantMax, constantMin, difficulty, dxRatingTagIndex, maimai?.records, multiAchievement, nearMiss, quantity, selectedDxRatingTagIds, soloAchievement, splitVersions, strictAchievement, type, versionConditionLabel, versionLabels, versions]);
  const scoreSections = useMemo<BestImageScoreSection[]>(() => imageType === 'best50'
    ? maimai?.bestSections ?? []
    : customSections, [customSections, imageType, maimai?.bestSections]);
  const maximumRowsPerPage = maximumBestImageRowsForWidth(outputWidth);
  const pages = useMemo(
    () => paginateBestImageSections(scoreSections, maximumRowsPerPage),
    [maximumRowsPerPage, scoreSections],
  );
  const pageStructureKey = JSON.stringify(scoreSections.map((section) => [
    section.id,
    section.title,
    ...section.records.map((record) => `${record.songId}:${record.type}:${record.levelIndex}`),
  ]));

  useEffect(() => {
    setCurrentPageIndex(0);
    setPageHeights({});
  }, [imageType, pageStructureKey, setCurrentPageIndex, setPageHeights]);

  const coverRequestKey = JSON.stringify(scoreSections.flatMap((section) => section.records.map((record) => record.songId)));
  useEffect(() => {
    let cancelled = false;
    setCoverUrls(null);
    setCoverProgress({ completed: 0, total: 0 });
    const songIds = JSON.parse(coverRequestKey) as string[];
    loadBestImageJackets(songIds, (completed, total) => {
      if (!cancelled) setCoverProgress({ completed, total });
    }).then((nextCoverUrls) => {
      if (!cancelled) setCoverUrls(nextCoverUrls);
    });
    return () => { cancelled = true; };
  }, [coverRequestKey]);

  const htmlPages = useMemo(() => embeddedAssets && coverUrls ? pages.map((page) => buildBestImageHtml({
    type: imageType,
    width: outputWidth,
    player: previewPlayer,
    rating,
    scoreSections: page.sections,
    coverUrls,
    hiddenStyles,
    ratingStyle,
    pageIndex: page.pageIndex,
    pageCount: page.pageCount,
    ...embeddedAssets,
    cnFontUrl: 'maimai-noto.ttf',
    dataSource: player?.source?.label ?? '',
  })) : null, [coverUrls, embeddedAssets, hiddenStyles, imageType, outputWidth, pages, previewPlayer, rating, ratingStyle, player?.source?.label]);
  const htmlPagesRef = useRef(htmlPages);
  htmlPagesRef.current = htmlPages;
  const htmlGenerationKey = JSON.stringify([imageType, outputWidth, previewPlayer, rating, ratingStyle, hiddenStyles, pages]);
  useEffect(() => {
    setWebViewSources(null);
    setWebViewSourceError(null);
    const currentHtmlPages = htmlPagesRef.current;
    if (!currentHtmlPages || !assetsDirectory) return;
    try {
      const prepared = prepareBestImageWebViewSources(currentHtmlPages, assetsDirectory);
      setWebViewSources(prepared.sources);
      return prepared.dispose;
    } catch {
      setWebViewSourceError('WebView 本地页面准备失败');
    }
  }, [coverUrls, embeddedAssets, assetsDirectory, htmlGenerationKey]);
  const outputHeight = pageHeights[pages[Math.min(currentPageIndex, pages.length - 1)]!.id] ?? minimumBestImageHeight(outputWidth);
  const currentWebViewState = webViewStates[pages[Math.min(currentPageIndex, pages.length - 1)]!.id];
  const webViewStatusText = webViewSourceError
    ? 'WebView 版本未知 · 本地页面准备失败'
    : webViewSources
    ? `WebView ${currentWebViewState?.version ?? '版本未知'} · ${BEST_IMAGE_WEBVIEW_PHASE_LABELS[currentWebViewState?.phase ?? 'loading']}`
    : 'WebView 版本未知 · 等待预览素材';
  const assetStatusText = fontProgress.phase === 'checking' || fontProgress.phase === 'downloading'
    ? `${FONT_PROGRESS_LABELS[fontProgress.phase]}${fontProgress.currentFont ? ` ${fontProgress.currentFont}` : ''}`
    : uiProgress.phase === 'checking' || uiProgress.phase === 'downloading' || uiProgress.phase === 'unpacking'
      ? `正在准备导出素材 ${uiProgress.completed}/${uiProgress.total}`
      : '导出素材准备完成';
  const exportBusy = exportPageIndex !== null || exportStatus !== null;
  const formValid = imageType !== 'custom' || customInputValid;

  useBestImageWebViewTimeout(
    !!webViewSources,
    pages[Math.min(currentPageIndex, pages.length - 1)]!.id,
    currentWebViewState?.phase,
    setWebViewStates,
  );

  const handleSoloAchievementChange = (value: MaimaiFcAchievement | null) => {
    setSoloAchievement(value);
    if (value === null && multiAchievement === null) setStrictAchievement(false);
  };

  const handleMultiAchievementChange = (value: MaimaiFsAchievement | null) => {
    setMultiAchievement(value);
    if (value === null && soloAchievement === null) setStrictAchievement(false);
  };

  const handleVersionsChange = (next: string[]) => {
    setVersions(next);
    if (next.length < 2) setSplitVersions(false);
  };

  const resetCustomFilters = () => {
    setDifficulty('all');
    setType('all');
    setConstantMin('');
    setConstantMax('');
    setAchievementMin('');
    setAchievementMax('');
    setSoloAchievement(null);
    setMultiAchievement(null);
    setStrictAchievement(false);
    setNearMiss(false);
    setSelectedDxRatingTagIds([]);
    setVersions(versionOptions.map((option) => option.value));
  };

  const selectCollection = (choice: BestImageCollectionChoice) => {
    if (!activePicker) return;
    if (choice.mode === 'random') randomizedSelections.current.add(`${activeAccountId ?? 'local-preview'}:${activePicker}`);
    setPrefs((current) => {
      const next = { ...current.selections };
      if (choice.mode === 'current') delete next[activePicker];
      else next[activePicker] = choice;
      return { ...current, selections: next };
    });
    setActivePicker(null);
  };

  const exportImages = () => runExportImages({
    pages,
    htmlPages,
    sources: webViewSources,
    canExport: assetsReady && formValid,
    buildExportFilename: (index, pageCount) => bestImageExportFilename(basePlayer.displayName, imageType, index, pageCount),
  });

  return <BestImageScreenShell
    imageTypes={IMAGE_TYPES}
    activeType={imageType}
    onSelectType={(id) => controller.setType(id)}
    customPanelBody={imageType === 'custom' ? <>
      <MaimaiFilterBar
        collapsed={false}
        collapsible={false}
        onCollapsedChange={() => undefined}
        difficulty={difficulty}
        version="all"
        type={type}
        constantMin={constantMin}
        constantMax={constantMax}
        achievementMin={achievementMin}
        achievementMax={achievementMax}
        soloAchievement={soloAchievement}
        multiAchievement={multiAchievement}
        versionLocale={versionLocale}
        versions={versionOptions}
        dxRatingTags={dxRatingChartTags.data?.tags ?? []}
        selectedDxRatingTagIds={selectedDxRatingTagIds}
        dxRatingTagState={dxRatingChartTags.data ? 'ready' : dxRatingChartTags.isLoading ? 'loading' : 'unavailable'}
        versionMulti
        selectedVersions={versions}
        currentVersionTitle={maimai?.currentVersionTitle}
        onDifficultyChange={setDifficulty}
        onVersionChange={() => undefined}
        onTypeChange={setType}
        onConstantMinChange={setConstantMin}
        onConstantMaxChange={setConstantMax}
        onAchievementMinChange={setAchievementMin}
        onAchievementMaxChange={setAchievementMax}
        onSoloAchievementChange={handleSoloAchievementChange}
        onMultiAchievementChange={handleMultiAchievementChange}
        onVersionLocaleChange={setVersionLocale}
        onDxRatingTagIdsChange={setSelectedDxRatingTagIds}
        onVersionsChange={handleVersionsChange}
        onReset={resetCustomFilters}
      />
      <View style={styles.fieldRow}>
        <View style={styles.textFieldWrap}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>数量</Text>
          <TextInput accessibilityLabel="自定义数量" autoCorrect={false} value={quantityText} onChangeText={(value) => {
            controller.setQuantityText(value);
            const parsed = parseBestImageQuantity(value);
            if (parsed !== null) setQuantity(parsed);
          }} placeholder="0 为无限制" placeholderTextColor={theme.textMuted} style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }, quantityError && styles.textInputError]} />
          {quantityError ? <Text style={[styles.errorText, { color: theme.danger }]}>{quantityError}</Text> : null}
        </View>
      </View>
      <View style={styles.chipRow}>
        <BestImageChoiceChip accessibilityLabel="区分版本" label="区分版本" disabled={versions.length < 2} reportDisabledState selected={splitVersions} onPress={() => setSplitVersions((value) => !value)} styles={{ chip: styles.chip, chipText: styles.chipText, chipDisabled: styles.chipDisabled, chipTextDisabled: styles.chipTextDisabled }} />
        <BestImageChoiceChip accessibilityLabel="寸筛选" label="寸" reportDisabledState selected={nearMiss} onPress={() => setNearMiss((value) => !value)} styles={{ chip: styles.chip, chipText: styles.chipText, chipDisabled: styles.chipDisabled, chipTextDisabled: styles.chipTextDisabled }} />
        <BestImageChoiceChip accessibilityLabel="严格筛选" label="严格筛选" disabled={!hasAchievementFilter} reportDisabledState selected={strictAchievement} onPress={() => setStrictAchievement((value) => !value)} styles={{ chip: styles.chip, chipText: styles.chipText, chipDisabled: styles.chipDisabled, chipTextDisabled: styles.chipTextDisabled }} />
      </View>
    </> : null}
    styleListHeader={<View style={[styles.ratingStyleRow, { borderBottomColor: theme.border }]}>
      <View accessibilityRole="tablist" style={[styles.segmentedControl, { backgroundColor: theme.surfaceMuted }]}>
        {RATING_STYLES.map(({ id, label }) => {
          const selected = ratingStyle === id;
          return <Pressable key={id} accessibilityLabel={label} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setRatingStyle(id)} style={[styles.segment, selected && { backgroundColor: theme.surface }]}>
            <Text style={[styles.segmentText, { color: theme.textMuted }, selected && { color: theme.accent }]}>{label}</Text>
          </Pressable>;
        })}
      </View>
    </View>}
    styleRows={STYLE_ITEMS.map(({ kind, label }) => {
      const selection = styleSelections[kind];
      const selectedItem = selection?.mode === 'item' || selection?.mode === 'random' ? selection.item : undefined;
      const fallbackName = kind === 'trophy' ? basePlayer.presentation?.trophyName : `玩家当前${label}`;
      const selectionName = selection?.mode === 'off' ? '已关闭' : selection?.mode === 'random' ? `随机 · ${selection.item.name}` : selectedItem?.name ?? fallbackName ?? '未设置';
      return <Pressable key={kind} accessibilityLabel={`选择${label}`} accessibilityRole="button" onPress={() => setActivePicker(kind)} style={({ pressed }) => [styles.styleRow, { borderBottomColor: theme.border }, pressed && { backgroundColor: theme.surfaceMuted }]}>
        <View style={styles.stylePreview}><StylePreview kind={kind} selection={selection} player={basePlayer} /></View>
        <View style={styles.styleCopy}><Text style={[styles.styleName, { color: theme.text }]}>{label}</Text><Text numberOfLines={1} style={[styles.styleValue, { color: theme.textMuted }]}>{selectionName}</Text></View>
        <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
      </Pressable>;
    })}
    widths={OUTPUT_WIDTHS}
    activeWidth={outputWidth}
    onChooseWidth={(nextWidth) => {
      controller.setWidth(nextWidth);
      setPageHeights({});
    }}
    dimensionMeta={`${outputWidth} × ${outputHeight} px · 每页最多 ${maximumRowsPerPage} 行 · 第 ${currentPageIndex + 1}/${pages.length} 页`}
    previewTestIdPrefix="best-image"
    sources={webViewSources}
    pages={pages}
    pageIndex={currentPageIndex}
    onPageIndexChange={setCurrentPageIndex}
    onPreviewStatesChange={setWebViewStates}
    onPreviewMessage={handlePreviewMessage}
    fileAccessFromFileURLs
    allowingReadAccessToUrl={assetsDirectory?.uri}
    loadingPreview={exportAssetError || assetError || webViewSourceError ? <View style={styles.loadingContent}>
      <Text accessibilityRole="alert" style={[styles.assetError, { color: theme.danger }]}>{exportAssetError ?? assetError ?? webViewSourceError}</Text>
      {exportAssetError ? <Pressable accessibilityRole="button" accessibilityLabel="重试字体下载" onPress={() => setFontAttempt((value) => value + 1)} style={[styles.retryButton, { borderColor: theme.accent }]}>
        <Text style={[styles.retryButtonText, { color: theme.accent }]}>重试</Text>
      </Pressable> : null}
    </View> : <View style={styles.loadingContent}>
      <ActivityIndicator accessibilityLabel="正在加载预览素材" color={theme.accent} size="large" />
      <Text style={[styles.loadingText, { color: theme.textMuted }]}>{!assetsDirectory ? assetStatusText : coverProgress.total > 0 && coverUrls === null ? `正在逐张缓存歌曲封面 ${coverProgress.completed}/${coverProgress.total}` : '正在加载预览素材'}</Text>
    </View>}
    fontStatus={webViewSources && !assetsReady ? <View accessibilityLiveRegion="polite" style={[styles.fontStatus, { backgroundColor: theme.surface, borderColor: exportAssetError ? theme.danger : theme.border }]}>
      {exportAssetError ? <>
        <Text accessibilityRole="alert" style={[styles.fontStatusText, { color: theme.danger }]}>{exportAssetError}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="重试字体下载" onPress={() => setFontAttempt((value) => value + 1)} style={[styles.retryButton, { borderColor: theme.accent }]}>
          <Text style={[styles.retryButtonText, { color: theme.accent }]}>重试</Text>
        </Pressable>
      </> : <>
        <ActivityIndicator color={theme.accent} size="small" />
        <Text style={[styles.fontStatusText, { color: theme.textMuted }]}>{assetStatusText}；所需素材准备完成后可导出</Text>
      </>}
    </View> : null}
    fontStatusAboveDots={false}
    exportDisabled={!webViewSources || !assetsReady || !formValid || exportBusy}
    exportSpinner={exportBusy}
    exportIdleLabel={assetsReady ? '导出到相册' : '所需素材准备完成后可导出'}
    exportStatus={exportStatus}
    onExport={() => void exportImages()}
    statusTestId="best-image-webview-status"
    statusText={webViewStatusText}
    exportIndex={exportPageIndex}
    exportHeight={exportHeight}
    exportSource={exportPageIndex !== null && htmlPages?.[exportPageIndex] && webViewSources?.[exportPageIndex] ? webViewSources[exportPageIndex]! : null}
    exportWebViewKeyPrefix="export"
    captureRef={exportCaptureRef}
    captureBackgroundColor="#E7EDF5"
    onExportMessage={handleExportMessage}
    onRequestCloseExport={cancelExportRequest}
    pickers={<BestImageCollectionPicker visible={activePicker !== null} kind={activePicker} items={collections.data?.items ?? []} selectedId={activePicker && (styleSelections[activePicker]?.mode === 'item' || styleSelections[activePicker]?.mode === 'random') ? styleSelections[activePicker].item.id : null} selectedMode={activePicker ? styleSelections[activePicker]?.mode ?? 'current' : 'current'} isLoading={collections.isLoading} isError={collections.isError} onRetry={() => { void collections.refetch(); }} onClose={() => setActivePicker(null)} onSelect={selectCollection} />}
    styles={styles}
  />;
}

const maimaiStyles = StyleSheet.create({
  // 舞萌差异键：数量输入行（fieldLabel 带 marginBottom、无 gap 汇聚）、
  // 错误文案字号、chip 行、禁用 chip、素材错误/重试、素材状态条、导出遮罩底色。
  textFieldWrap: { flex: 1, minWidth: 0 },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  errorText: { marginTop: 4, fontSize: 10, lineHeight: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chipDisabled: { opacity: 0.42 },
  chipTextDisabled: { color: '#9CA3AF' },
  assetError: { fontSize: 14, fontWeight: '700' },
  retryButton: { minHeight: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, borderWidth: 1 },
  retryButtonText: { fontSize: 13, fontWeight: '700' },
  fontStatus: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12 },
  fontStatusText: { fontSize: 12, fontWeight: '600' },
  exportRoot: { flex: 1, overflow: 'hidden', backgroundColor: '#E7EDF5' },
});

/** 共享骨架样式 + 舞萌差异覆盖。 */
const styles = { ...bestImageScreenSharedStyles, ...maimaiStyles };

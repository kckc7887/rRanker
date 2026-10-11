import { CollectionImage } from '@/components/CollectionImage';
import { MaimaiFilterBar, dxRatingTagFilterState } from '@/components/MaimaiFilterBar';
import type { GameDataBundle } from '@/domain/game-data';
import type { Player } from '@/domain/models';
import {
  BestImageCollectionPicker,
  TrophyPreview,
} from '@/features/best-image/best-image-collection-picker';
import {
  DEFAULT_CUSTOM_BEST_IMAGE_FILTERS,
  parseBestImageQuantity
} from '@/features/best-image/best-image-custom';
import { bestImageExportFilename } from '@/features/best-image/best-image-export';
import {
  BestImageChoiceChip,
  BestImageScreenShell,
  bestImageScreenSharedStyles,
} from '@/features/best-image/best-image-screen-shell';
import {
  bestImageStylePreferencesStore,
  type AppliedBestImageStyleSelection,
  type BestImageCollectionChoice,
  type BestImageCollectionKind,
  type BestImageRatingStyle,
  type BestImageStyleSelections,
} from '@/features/best-image/best-image-style-preferences';
import { useBestImageWebViewTimeout } from '@/features/best-image/best-image-webview-state';
import { minimumBestImageHeight } from '@/features/best-image/build-best-image-html';
import type { MaimaiFontProgress } from '@/features/best-image/maimai-font-cache';
import type { MaimaiUiProgress } from '@/features/best-image/maimai-ui-cache';
import type { BestImageWebViewSource } from '@/features/best-image/prepare-best-image-webview-sources';
import { useBestImageCollections } from '@/features/best-image/use-best-image-collections';
import { useBestImageScreenController, usePreparedBestImageSources } from '@/features/best-image/use-best-image-screen-controller';
import {
  buildBestImageHtml,
  type BestImageType
} from '@/features/maimai-best-image/build-maimai-best-image-html';
import { useMaimaiBestImageFilters } from '@/features/maimai-best-image/use-maimai-best-image-filters';
import { FONT_PROGRESS_LABELS, useMaimaiEmbeddedAssets, useMaimaiExportAssets, useMaimaiImageCovers } from '@/features/maimai-best-image/use-maimai-best-image-resources';
import type { useTransientDetailedMaimaiCatalog } from '@/hooks/use-detailed-catalog';
import { useGameData } from '@/hooks/use-game-data';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { useAppTheme } from '@/theme/app-theme';
import type { Directory } from 'expo-file-system';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const IMAGE_TYPES: { id: BestImageType; label: string; }[] = [
  { id: 'best50', label: 'Best50' },
  { id: 'custom', label: '自定义' },
];
const RATING_STYLES: { id: BestImageRatingStyle; label: string; }[] = [
  { id: 'game', label: '游戏风格' },
  { id: 'app', label: '应用风格' },
];
const OUTPUT_WIDTHS = [1080, 1440, 2160] as const;
const STYLE_ITEMS: { kind: BestImageCollectionKind; label: string; }[] = [
  { kind: 'icon', label: '头像' },
  { kind: 'plate', label: '姓名框' },
  { kind: 'trophy', label: '称号' },
  { kind: 'frame', label: '背景' },
];
const FALLBACK_PLAYER: Pick<Player, 'displayName' | 'presentation' | 'extension'> = {
  displayName: '未读取玩家资料',
  presentation: undefined,
};
type MaimaiBestImagePrefs = { selections: BestImageStyleSelections; ratingStyle: BestImageRatingStyle; };
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

export function MaimaiBestImageScreen() {
  const theme = useAppTheme();
  const lifecycle = useAppLifecycle();
  const { data, activeAccountId } = useGameData();
  const randomizedSelections = useRef(new Set<string>());
  const collections = useBestImageCollections();
  const { maimai, player, basePlayer, rating } = maimaiImageData(data);
  const [assetsDirectory, setAssetsDirectory] = useState<Directory | null>(null);

  const controller = useBestImageScreenController<BestImageType, MaimaiBestImagePrefs, BestImageCollectionKind>(
    {
      accountId: activeAccountId,
      game: 'maimai',
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
  const { assetSession } = controller;
  const { embeddedAssets, assetError } = useMaimaiEmbeddedAssets(assetSession, rating, lifecycle);
  const { setQuantity, versions, splitVersions, setSplitVersions, difficulty, setDifficulty, type, setType, constantMin, setConstantMin, constantMax, setConstantMax, achievementMin, setAchievementMin, achievementMax, setAchievementMax, soloAchievement, multiAchievement, strictAchievement, setStrictAchievement, nearMiss, setNearMiss, versionLocale, setVersionLocale, selectedDxRatingTagIds, setSelectedDxRatingTagIds, quantityError, customInputValid, hasAchievementFilter, dxRatingChartTags, versionOptions, detailedCatalog, scoreSections, maximumRowsPerPage, pages, pageStructureKey, handleSoloAchievementChange, handleMultiAchievementChange, handleVersionsChange, resetCustomFilters } = useMaimaiBestImageFilters({ maimai, activeAccountId, imageType, outputWidth, quantityText });
  const { selections: styleSelections, ratingStyle } = prefs;
  const setRatingStyle = (nextRatingStyle: BestImageRatingStyle) => {
    setPrefs((current) => ({ ...current, ratingStyle: nextRatingStyle }));
  };

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

  const previewPlayer = useMemo(() => maimaiPreviewPlayer(basePlayer, styleSelections), [basePlayer, styleSelections]);
  const hiddenStyles = useMemo(() => STYLE_ITEMS.filter(({ kind }) => styleSelections[kind]?.mode === 'off').map(({ kind }) => kind), [styleSelections]);

  useEffect(() => {
    setCurrentPageIndex(0);
    setPageHeights({});
  }, [imageType, pageStructureKey, setCurrentPageIndex, setPageHeights]);

  const coverRequestKey = JSON.stringify(scoreSections.flatMap((section) => section.records.map((record) => record.songId)));
  const { coverUrls, coverProgress } = useMaimaiImageCovers(assetSession, coverRequestKey, lifecycle);

  const htmlPages = useMemo(() => embeddedAssets && coverUrls && detailedCatalog.data ? pages.map((page) => buildBestImageHtml({
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
  })) : null, [coverUrls, detailedCatalog.data, embeddedAssets, hiddenStyles, imageType, outputWidth, pages, previewPlayer, rating, ratingStyle, player?.source?.label]);
  const htmlGenerationKey = JSON.stringify([imageType, outputWidth, previewPlayer, rating, ratingStyle, hiddenStyles, pages]);
  const sourceGeneration = useMemo(() => [coverUrls, embeddedAssets, htmlGenerationKey, detailedCatalog.data], [coverUrls, embeddedAssets, htmlGenerationKey, detailedCatalog.data]);
  const { sources: webViewSources, error: webViewSourceError } = usePreparedBestImageSources(htmlPages, assetsDirectory, cancelExportRequest, sourceGeneration);
  const { assetsReady, fontProgress, uiProgress, exportAssetError, setFontAttempt } = useMaimaiExportAssets(assetSession, lifecycle, setAssetsDirectory);
  const outputHeight = pageHeights[pages[Math.min(currentPageIndex, pages.length - 1)]!.id] ?? minimumBestImageHeight(outputWidth);
  const currentWebViewState = webViewStates[pages[Math.min(currentPageIndex, pages.length - 1)]!.id];
  const assetStatusText = maimaiAssetStatus(fontProgress, uiProgress);
  const exportBusy = exportPageIndex !== null || exportStatus !== null;
  const formValid = imageType !== 'custom' || customInputValid;

  useBestImageWebViewTimeout(
    !!webViewSources,
    pages[Math.min(currentPageIndex, pages.length - 1)]!.id,
    currentWebViewState?.phase,
    setWebViewStates,
  );

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

  const exportState = maimaiExportState(assetsReady, formValid, exportBusy, htmlPages, webViewSources, exportPageIndex);
  const exportImages = () => runExportImages({
    pages,
    htmlPages,
    sources: webViewSources,
    canExport: assetsReady && formValid,
    buildExportFilename: (index, pageCount) => bestImageExportFilename(basePlayer.displayName, imageType, index, pageCount),
  });

  return <BestImageScreenShell
    appearance={{
      imageTypes: IMAGE_TYPES,
      activeType: imageType,
      onSelectType: (id) => controller.setType(id),
      customPanelBody: imageType === 'custom' ? <>
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
          dxRatingTagState={dxRatingTagFilterState(dxRatingChartTags)}
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
      </> : null,
      styleListHeader: <View style={[styles.ratingStyleRow, { borderBottomColor: theme.border }]}>
        <View accessibilityRole="tablist" style={[styles.segmentedControl, { backgroundColor: theme.surfaceMuted }]}>
          {RATING_STYLES.map(({ id, label }) => {
            const selected = ratingStyle === id;
            return <Pressable key={id} accessibilityLabel={label} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setRatingStyle(id)} style={[styles.segment, selected && { backgroundColor: theme.surface }]}>
              <Text style={[styles.segmentText, { color: theme.textMuted }, selected && { color: theme.accent }]}>{label}</Text>
            </Pressable>;
          })}
        </View>
      </View>,
      styleRows: STYLE_ITEMS.map(({ kind, label }) => {
        const selection = styleSelections[kind];
        const selectedItem = selection?.mode === 'item' || selection?.mode === 'random' ? selection.item : undefined;
        const fallbackName = kind === 'trophy' ? basePlayer.presentation?.trophyName : `玩家当前${label}`;
        const selectionName = selection?.mode === 'off' ? '已关闭' : selection?.mode === 'random' ? `随机 · ${selection.item.name}` : selectedItem?.name ?? fallbackName ?? '未设置';
        return <Pressable key={kind} accessibilityLabel={`选择${label}`} accessibilityRole="button" onPress={() => setActivePicker(kind)} style={({ pressed }) => [styles.styleRow, { borderBottomColor: theme.border }, pressed && { backgroundColor: theme.surfaceMuted }]}>
          <View style={styles.stylePreview}><StylePreview kind={kind} selection={selection} player={basePlayer} /></View>
          <View style={styles.styleCopy}><Text style={[styles.styleName, { color: theme.text }]}>{label}</Text><Text numberOfLines={1} style={[styles.styleValue, { color: theme.textMuted }]}>{selectionName}</Text></View>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
        </Pressable>;
      }),
      widths: OUTPUT_WIDTHS,
      activeWidth: outputWidth,
      onChooseWidth: (nextWidth) => {
        controller.setWidth(nextWidth);
        setPageHeights({});
      },
      dimensionMeta: `${outputWidth} × ${outputHeight} px · 每页最多 ${maximumRowsPerPage} 行 · 第 ${currentPageIndex + 1}/${pages.length} 页`,
      loadingPreview: <MaimaiAssetLoading exportAssetError={exportAssetError} assetError={assetError} webViewSourceError={webViewSourceError} detailedCatalog={detailedCatalog} assetsDirectory={assetsDirectory} assetStatusText={assetStatusText} coverProgress={coverProgress} coverUrls={coverUrls} retryAssets={() => setFontAttempt(value => value + 1)} />,
      fontStatus: <MaimaiFontStatus webViewSources={webViewSources} assetsReady={assetsReady} exportAssetError={exportAssetError} assetStatusText={assetStatusText} retryAssets={() => setFontAttempt(value => value + 1)} />,
      fontStatusAboveDots: false,
      pickers: <BestImageCollectionPicker visible={activePicker !== null} kind={activePicker} items={collections.data?.items ?? []} {...maimaiPickerSelection(activePicker, styleSelections)} isLoading={collections.isLoading} isError={collections.isError} onRetry={() => { void collections.refetch(); }} onClose={() => setActivePicker(null)} onSelect={selectCollection} />,
      styles: styles,
    }}
    preview={{
      previewTestIdPrefix: "best-image",
      sources: webViewSources,
      pages: pages,
      pageIndex: currentPageIndex,
      onPageIndexChange: setCurrentPageIndex,
      onPreviewStatesChange: setWebViewStates,
      onPreviewMessage: handlePreviewMessage,
      fileAccessFromFileURLs: true,
      allowingReadAccessToUrl: assetSession.directory.uri,
    }}
    exportSession={{
      exportDisabled: exportState.disabled,
      exportSpinner: exportBusy,
      exportIdleLabel: exportState.label,
      exportStatus: exportStatus,
      onExport: () => void exportImages(),
      exportIndex: exportPageIndex,
      exportHeight: exportHeight,
      exportSource: exportState.source,
      exportWebViewKeyPrefix: "export",
      captureRef: exportCaptureRef,
      captureBackgroundColor: "#E7EDF5",
      onExportMessage: handleExportMessage,
      onRequestCloseExport: cancelExportRequest,
    }}
  />;
}

function maimaiImageData(data: GameDataBundle | undefined) {
  const maimai = data?.payload.kind === 'maimai' ? data.payload : null;
  const player = maimai?.player;
  return { maimai, player, basePlayer: player ?? FALLBACK_PLAYER, rating: maimai?.playerScore.value ?? 0 };
}

function selectedStyleItem(selection: AppliedBestImageStyleSelection | undefined) {
  return selection?.mode === 'item' || selection?.mode === 'random' ? selection.item : undefined;
}
function maimaiPreviewPlayer(base: typeof FALLBACK_PLAYER, selections: BestImageStyleSelections) {
  const icon = selectedStyleItem(selections.icon), plate = selectedStyleItem(selections.plate);
  const frame = selectedStyleItem(selections.frame), trophy = selectedStyleItem(selections.trophy);
  return {
    displayName: base.displayName, extension: base.extension,
    presentation: {
      ...base.presentation,
      iconId: icon ? icon.id : base.presentation?.iconId,
      namePlateId: plate ? plate.id : base.presentation?.namePlateId,
      frameId: frame ? frame.id : base.presentation?.frameId,
      trophyName: trophy ? trophy.name : base.presentation?.trophyName,
      trophyColor: trophy ? trophy.color : base.presentation?.trophyColor,
    },
  };
}
function maimaiPickerSelection(kind: BestImageCollectionKind | null, selections: BestImageStyleSelections) {
  const selection = kind ? selections[kind] : undefined;
  return { selectedId: selectedStyleItem(selection)?.id ?? null, selectedMode: selection?.mode ?? 'current' as const };
}
function maimaiAssetStatus(fontProgress: MaimaiFontProgress, uiProgress: MaimaiUiProgress) {
  return fontProgress.phase === 'checking' || fontProgress.phase === 'downloading'
    ? `${FONT_PROGRESS_LABELS[fontProgress.phase]}${fontProgress.currentFont ? ` ${fontProgress.currentFont}` : ''}`
    : uiProgress.phase === 'checking' || uiProgress.phase === 'downloading' || uiProgress.phase === 'unpacking'
      ? `正在准备导出素材 ${uiProgress.completed}/${uiProgress.total}`
      : '导出素材准备完成';
}
function maimaiExportState(ready: boolean, valid: boolean, busy: boolean, pages: string[] | null, sources: BestImageWebViewSource[] | null, index: number | null) {
  return {
    disabled: !sources || !ready || !valid || busy,
    label: ready ? '导出到相册' : '所需素材准备完成后可导出',
    source: index !== null && pages?.[index] && sources?.[index] ? sources[index]! : null
  };
}
type MaimaiAssetLoadingProps = {
  exportAssetError: string | null; assetError: string | null; webViewSourceError: string | null;
  detailedCatalog: ReturnType<typeof useTransientDetailedMaimaiCatalog>; assetsDirectory: Directory | null;
  assetStatusText: string; coverProgress: { completed: number; total: number; }; coverUrls: Record<string, string | null> | null;
  retryAssets: () => void;
};
function MaimaiAssetLoading({ exportAssetError, assetError, webViewSourceError, detailedCatalog, assetsDirectory, assetStatusText, coverProgress, coverUrls, retryAssets }: MaimaiAssetLoadingProps) {
  const theme = useAppTheme();
  return exportAssetError || assetError || webViewSourceError || detailedCatalog.error ? <View style={styles.loadingContent}>
    <Text accessibilityRole="alert" style={[styles.assetError, { color: theme.danger }]}>{exportAssetError ?? assetError ?? webViewSourceError ?? '暂时无法读取谱面物量，请重试。'}</Text>
    {exportAssetError ? <Pressable accessibilityRole="button" accessibilityLabel="重试字体下载" onPress={() => retryAssets()} style={[styles.retryButton, { borderColor: theme.accent }]}>
      <Text style={[styles.retryButtonText, { color: theme.accent }]}>重试</Text>
    </Pressable> : null}
    {detailedCatalog.error ? <Pressable accessibilityRole="button" accessibilityLabel="重试谱面物量" onPress={detailedCatalog.refetch} style={[styles.retryButton, { borderColor: theme.accent }]}>
      <Text style={[styles.retryButtonText, { color: theme.accent }]}>重试</Text>
    </Pressable> : null}
  </View> : <View style={styles.loadingContent}>
    <ActivityIndicator accessibilityLabel="正在加载预览素材" color={theme.accent} size="large" />
    <Text style={[styles.loadingText, { color: theme.textMuted }]}>{detailedCatalog.isLoading ? '正在准备谱面物量' : !assetsDirectory ? assetStatusText : coverProgress.total > 0 && coverUrls === null ? `正在准备歌曲封面 ${coverProgress.completed}/${coverProgress.total}` : '正在准备预览'}</Text>
  </View>;
}
function MaimaiFontStatus({ webViewSources, assetsReady, exportAssetError, assetStatusText, retryAssets }: {
  webViewSources: BestImageWebViewSource[] | null; assetsReady: boolean; exportAssetError: string | null; assetStatusText: string; retryAssets: () => void;
}) {
  const theme = useAppTheme();
  return webViewSources && !assetsReady ? <View accessibilityLiveRegion="polite" style={[styles.fontStatus, { backgroundColor: theme.surface, borderColor: exportAssetError ? theme.danger : theme.border }]}>
        {exportAssetError ? <>
          <Text accessibilityRole="alert" style={[styles.fontStatusText, { color: theme.danger }]}>{exportAssetError}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="重试字体下载" onPress={retryAssets} style={[styles.retryButton, { borderColor: theme.accent }]}>
            <Text style={[styles.retryButtonText, { color: theme.accent }]}>重试</Text>
          </Pressable>
        </> : <>
          <ActivityIndicator color={theme.accent} size="small" />
          <Text style={[styles.fontStatusText, { color: theme.textMuted }]}>{assetStatusText}；所需素材准备完成后可导出</Text>
        </>}
      </View> : null;
}

const maimaiStyles = StyleSheet.create({
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

const styles = { ...bestImageScreenSharedStyles, ...maimaiStyles };

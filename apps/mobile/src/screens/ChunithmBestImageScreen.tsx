import { buildChunithmCardBackgroundAssets, useChunithmBestImageAssets } from '@/features/chunithm-best-image/use-chunithm-best-image-assets';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChunithmFilterBar } from '@/components/chunithm/ChunithmFilterBar';
import {
  appendChunithmSelectionScores,
  paginateChunithmBestImageSections,
  type ChunithmBestImageSelectionCount,
  type ChunithmBestImageType,
} from '@/features/chunithm-best-image/chunithm-best-image';
import {
  buildCustomChunithmBestImageSections,
  DEFAULT_CUSTOM_CHUNITHM_BEST_IMAGE_FILTERS,
  parseBestImageQuantity,
  type CustomChunithmBestImageFilters,
} from '@/features/chunithm-best-image/chunithm-best-image-custom';
import {
  chunithmBestImagePreferencesStore,
  DEFAULT_CHUNITHM_BEST_IMAGE_STYLES,
  resolveChunithmBestImageStyleId,
  type ChunithmBestImageStyleChoice,
} from '@/features/chunithm-best-image/chunithm-best-image-preferences';
import { ChunithmBestImageBackgroundPicker } from '@/features/chunithm-best-image/chunithm-best-image-background-picker';
import { ChunithmBestImageStylePicker, ChunithmBestImageTrophyPreview } from '@/features/chunithm-best-image/chunithm-best-image-style-picker';
import { useChunithmCollections } from '@/hooks/use-chunithm-collections';
import { useBestImageAssets } from '@/features/best-image/use-best-image-assets';
import {
  loadChunithmBestImageJackets,
  resolveChunithmBestImageJacketId,
} from '@/features/chunithm-best-image/load-chunithm-best-image-jackets';
import { buildChunithmBestImageHtml } from '@/features/chunithm-best-image/build-chunithm-best-image-html';
import {
  buildChunithmScoreCards,
  compareChunithmScores,
} from '@/domain/chunithm-score-presentation';
import { CHUNITHM_DIFFICULTY_LABELS } from '@/domain/chunithm';
import { buildChunithmCharacterUrl, buildChunithmPlateUrl, buildChunithmTrophyUrl, type ChunithmPlayer } from '@/domain/chunithm-personal';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { useGameData } from '@/hooks/use-game-data';
import { useAppTheme } from '@/theme/app-theme';
import { bestImageExportFilename } from '@/features/best-image/best-image-export';
import {
  BestImageChoiceChip,
  BestImageScreenShell,
  bestImageScreenSharedStyles,
} from '@/features/best-image/best-image-screen-shell';
import { useBestImageScreenController, usePreparedBestImageSources, type BestImageTemplate } from '@/features/best-image/use-best-image-screen-controller';

const WIDTHS = [1080, 1440, 2160] as const;
const SELECTION_COUNTS: readonly ChunithmBestImageSelectionCount[] = [0, 5, 10];
const IMAGE_TYPES: readonly { id: ChunithmBestImageType; label: string }[] = [
  { id: 'best50', label: 'Best50' },
  { id: 'custom', label: '自定义' },
];
const CUSTOM_MAX_ROWS_PER_PAGE = 50;

const chunithmPreferencesAdapter = {
  load: (accountId: string) => chunithmBestImagePreferencesStore.load(accountId),
  save: (accountId: string, prefs: typeof DEFAULT_CHUNITHM_BEST_IMAGE_STYLES) => chunithmBestImagePreferencesStore.save(accountId, prefs),
};

export function ChunithmBestImageScreen() {
  const theme = useAppTheme();
  const gameData = useGameData();
  const catalogQuery = useChunithmCatalog();
  const payload = gameData.data?.payload.kind === 'chunithm' ? gameData.data.payload : null;
  const catalog = catalogQuery.data;

  const [customFilters, setCustomFilters] = useState<CustomChunithmBestImageFilters>(DEFAULT_CUSTOM_CHUNITHM_BEST_IMAGE_FILTERS);
  const characters = useChunithmCollections('character');
  const plates = useChunithmCollections('plate');
  const trophies = useChunithmCollections('trophy');

  const controller = useBestImageScreenController<ChunithmBestImageType, typeof DEFAULT_CHUNITHM_BEST_IMAGE_STYLES, 'character' | 'plate' | 'trophy' | 'background'>({
    accountId: gameData.activeAccountId,
    game: 'chunithm',
    defaultType: 'best50',
    defaultWidth: 1080,
    defaultQuantityText: String(DEFAULT_CUSTOM_CHUNITHM_BEST_IMAGE_FILTERS.quantity),
    defaultPreferences: DEFAULT_CHUNITHM_BEST_IMAGE_STYLES,
    preferences: chunithmPreferencesAdapter,
    defaultExportHeight: (width) => Math.ceil(width * 0.75),
    previewRenderingGuard: true,
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
    previewStates,
    setPreviewStates,
    exportIndex,
    exportHeight,
    exportStatus,
    exportCaptureRef,
    exportImages: runExportImages,
    cancelExportRequest,
    handleExportMessage,
    handleExportLayout,
    handlePreviewMessage,
  } = controller;
  const { assetSession } = controller;

  const allCards = useMemo(
    () => buildChunithmScoreCards(payload?.scores ?? [], catalog).sort(compareChunithmScores),
    [catalog, payload?.scores],
  );

  const baseSections = useMemo(() => {
    if (!payload) return [];
    return payload.bestSections.map((section) => ({
      id: section.id,
      title: section.title,
      records: buildChunithmScoreCards(section.scores, catalog).sort(compareChunithmScores),
    }));
  }, [catalog, payload]);

  const selectionCards = useMemo(() => {
    if (!payload) return [];
    return buildChunithmScoreCards(payload.selections, catalog).sort(compareChunithmScores);
  }, [catalog, payload]);

  const versionConditionLabel = useMemo(() => {
    if (customFilters.version === 'all') return null;
    return catalog?.versions.find((item) => String(item.id) === customFilters.version)?.title ?? null;
  }, [catalog?.versions, customFilters.version]);

  const conditionLabels = useMemo(() => {
    const labels: string[] = [];
    if (customFilters.difficulty !== 'all') {
      labels.push(CHUNITHM_DIFFICULTY_LABELS[customFilters.difficulty]);
    }
    if (customFilters.constantMin || customFilters.constantMax) {
      labels.push(`定数 ${customFilters.constantMin || '不限'}~${customFilters.constantMax || '不限'}`);
    }
    if (customFilters.rankMin || customFilters.rankMax) {
      labels.push(`评价 ${customFilters.rankMin || '不限'}~${customFilters.rankMax || '不限'}`);
    }
    return labels;
  }, [
    customFilters.constantMax,
    customFilters.constantMin,
    customFilters.difficulty,
    customFilters.rankMax,
    customFilters.rankMin,
  ]);

  const sections = useMemo(() => {
    if (type === 'custom') {
      return buildCustomChunithmBestImageSections(allCards, {
        ...customFilters,
        versionConditionLabel,
        conditionLabels,
      });
    }
    return appendChunithmSelectionScores(baseSections, selectionCards, stylePrefs.selectionCount);
  }, [
    allCards,
    baseSections,
    conditionLabels,
    customFilters,
    selectionCards,
    stylePrefs.selectionCount,
    type,
    versionConditionLabel,
  ]);

  const pages = useMemo(
    () => paginateChunithmBestImageSections(
      sections,
      type === 'custom' ? CUSTOM_MAX_ROWS_PER_PAGE * 5 : 50 + stylePrefs.selectionCount,
    ),
    [sections, stylePrefs.selectionCount, type],
  );

  const jacketIdsByKey = useMemo(() => {
    const map: Record<string, string> = {};
    for (const section of sections) {
      for (const record of section.records) {
        map[record.key] = resolveChunithmBestImageJacketId(record.songId, record.levelIndex, catalog);
      }
    }
    return map;
  }, [catalog, sections]);

  const backgroundSong = useMemo(() => {
    if (stylePrefs.background.mode !== 'song') return null;
    const selectedSongId = stylePrefs.background.songId;
    return catalog?.songs.find((song) => song.id === selectedSongId) ?? null;
  }, [catalog?.songs, stylePrefs.background]);
  const backgroundJacketId = backgroundSong ? String(backgroundSong.id) : null;

  const jacketIds = useMemo(
    () => [...new Set([
      ...Object.values(jacketIdsByKey),
      ...(backgroundJacketId ? [backgroundJacketId] : []),
    ])],
    [backgroundJacketId, jacketIdsByKey],
  );
  const jackets = useBestImageAssets({
    session: assetSession,
    key: payload && controller.prefsReady ? JSON.stringify(jacketIds) : null,
    prepare: (signal, onProgress) => loadChunithmBestImageJackets(assetSession, jacketIds, (done, total) => onProgress(total ? done / total : 1), signal),
  });
  const coverUrls = jackets.data;

  const characterId = useMemo(
    () => resolveChunithmBestImageStyleId(stylePrefs.character, payload?.player?.character?.id),
    [payload?.player?.character?.id, stylePrefs.character],
  );
  const hideCharacter = stylePrefs.character.mode === 'off'
    || ((stylePrefs.character.mode === 'item' || stylePrefs.character.mode === 'random') && characterId === null);
  const plateId = Math.max(1, resolveChunithmBestImageStyleId(stylePrefs.plate, payload?.player?.name_plate?.id) ?? 1);
  const selectedTrophy = useMemo<ChunithmPlayer['trophy']>(() => {
    const choice = stylePrefs.trophy;
    if (choice.mode === 'current') return payload?.player?.trophy;
    if (choice.mode === 'off' || choice.id === undefined) return null;
    return { id: choice.id, name: choice.name, color: choice.color, level: choice.level };
  }, [payload?.player?.trophy, stylePrefs.trophy]);
  const { assets, drawingReady, drawingProgress, gameReady, error: assetError, retry: retryAssets } = useChunithmBestImageAssets(
    assetSession,
    hideCharacter ? null : buildChunithmCharacterUrl(characterId ?? 0),
    buildChunithmPlateUrl(plateId),
    selectedTrophy?.color === 'image' ? buildChunithmTrophyUrl(selectedTrophy.id) : null,
  );
  const characterDataUri = assets?.character ?? null;

  const backgroundDataUri = backgroundJacketId
    ? coverUrls?.[backgroundJacketId] ?? null
    : null;
  const dataSource = payload?.source.label ?? '';

  const template = useMemo<BestImageTemplate | null>(() => {
    if (!payload || !controller.prefsReady || !coverUrls || !assets) return null;
    return {
      brand: true,
      assets: buildChunithmCardBackgroundAssets(assetSession, sections.flatMap(section => section.records.map(record => ({ jacketId: jacketIdsByKey[record.key]!, levelIndex: record.levelIndex }))), coverUrls),
      build: cardBackgroundUrls => pages.map((page) => buildChunithmBestImageHtml({
        type,
        width,
        player: payload.player ? { ...payload.player, trophy: selectedTrophy } : null,
        ratingDisplay: payload.playerScore.display,
        page,
        cardBackgroundUrls,
        jacketIds: jacketIdsByKey,
        characterDataUri,
        plateDataUri: assets.plate,
        trophyDataUri: assets.trophy,
        backgroundDataUri,
        hideCharacter,
        hideTrophy: stylePrefs.trophy.mode === 'off',
        dataSource,
      })),
    };
  }, [
    assetSession,
    assets,
    controller.prefsReady,
    dataSource,
    selectedTrophy,
    stylePrefs.trophy.mode,
    backgroundDataUri,
    characterDataUri,
    coverUrls,
    hideCharacter,
    jacketIdsByKey,
    pages,
    payload,
    sections,
    type,
    width,
  ]);

  const { htmlPages, sources, ready: templateReady, progress: templateProgress, error: sourceError, retry: retryTemplate } = usePreparedBestImageSources(template, assetSession, assetSession.directory, cancelExportRequest);
  useEffect(() => {
    setPageHeights({}); setPageIndex(0); setPreviewStates({});
  }, [sources, setPageHeights, setPageIndex, setPreviewStates]);

  const currentPage = pages[Math.min(pageIndex, pages.length - 1)]!;
  const outputHeight = pageHeights[currentPage.id] ?? Math.ceil(width * 0.75);
  const webViewSources = sources;

  const chooseStyle = (kind: 'character' | 'plate' | 'trophy', choice: ChunithmBestImageStyleChoice) => {
    setStylePrefs((current) => ({ ...current, [kind]: choice }));
    setPicker(null);
  };

  const characterStyleValue = (): string => {
    const choice = stylePrefs.character;
    if (choice.mode === 'current') return '玩家当前角色';
    if (choice.mode === 'off') return '已关闭';
    if (choice.mode === 'random') return `随机${choice.name ? ` · ${choice.name}` : ''}`;
    return choice.name ?? '未设置';
  };

  const characterStylePreview = () => {
    if (stylePrefs.character.mode === 'off') {
      return <Text style={[styles.noAsset, { color: theme.textMuted }]}>已关闭</Text>;
    }
    if (characterDataUri) {
      return (
        <Image
          source={{ uri: characterDataUri }}
          style={styles.characterPreview}
          resizeMode="contain"
        />
      );
    }
    return <Text style={[styles.noAsset, { color: theme.textMuted }]}>未设置</Text>;
  };

  const plateStyleValue = stylePrefs.plate.mode === 'current' ? '玩家当前名牌'
    : stylePrefs.plate.mode === 'default' ? '默认板'
    : `${stylePrefs.plate.mode === 'random' ? '随机 · ' : ''}${stylePrefs.plate.name ?? '#' + plateId}`;

  const backgroundStyleValue = backgroundSong
    ? `${backgroundSong.title} · ID${backgroundSong.id}`
    : stylePrefs.background.mode === 'song'
      ? '歌曲已不可用 · 使用默认背景'
      : '默认浅色渐变';
  const backgroundPreviewUri = backgroundDataUri;

  const quantityError = parseBestImageQuantity(quantityText) === null
    ? '数量必须是非负整数，0 表示不限制'
    : null;
  const customInputValid = quantityError === null;
  const formValid = type !== 'custom' || customInputValid;
  const resetCustomFilters = () => {
    setCustomFilters((current) => ({
      ...DEFAULT_CUSTOM_CHUNITHM_BEST_IMAGE_FILTERS,
      quantity: current.quantity,
    }));
  };

  const exportImages = () => runExportImages({
    pages,
    htmlPages,
    sources: webViewSources,
    canExport: !!payload && formValid,
    buildExportFilename: (index, pageCount) => bestImageExportFilename(
      payload?.player?.name ?? 'player',
      type,
      index,
      pageCount,
    ),
  });

  if (!payload && !gameData.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textMuted }}>当前账号没有可生成的中二节奏成绩</Text>
      </View>
    );
  }

  return (
    <BestImageScreenShell
      appearance={{
        imageTypes: IMAGE_TYPES,
        activeType: type,
        onSelectType: setType,
        customPanelBody: type === 'custom' ? <>
        <ChunithmFilterBar
          collapsed={false}
          constantMax={customFilters.constantMax}
          constantMin={customFilters.constantMin}
          difficulty={customFilters.difficulty}
          onCollapsedChange={() => undefined}
          onConstantMaxChange={(constantMax) => setCustomFilters((current) => ({ ...current, constantMax }))}
          onConstantMinChange={(constantMin) => setCustomFilters((current) => ({ ...current, constantMin }))}
          onDifficultyChange={(difficulty) => setCustomFilters((current) => ({ ...current, difficulty }))}
          onRankMaxChange={(rankMax) => setCustomFilters((current) => ({ ...current, rankMax }))}
          onRankMinChange={(rankMin) => setCustomFilters((current) => ({ ...current, rankMin }))}
          onReset={resetCustomFilters}
          onVersionChange={(version) => setCustomFilters((current) => ({ ...current, version }))}
          rankMax={customFilters.rankMax}
          rankMin={customFilters.rankMin}
          version={customFilters.version}
          versions={catalog?.versions ?? []}
        />
        <View style={styles.fieldRow}>
          <View style={styles.textFieldWrap}>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>数量</Text>
            <TextInput
              accessibilityLabel="自定义数量"
              autoCorrect={false}
              keyboardType="number-pad"
              onChangeText={(value) => {
                setQuantityText(value);
                const parsed = parseBestImageQuantity(value);
                if (parsed !== null) {
                  setCustomFilters((current) => ({ ...current, quantity: parsed }));
                }
              }}
              placeholder="0 为无限制"
              placeholderTextColor={theme.textMuted}
              style={[
                styles.textInput,
                { backgroundColor: theme.input, borderColor: theme.border, color: theme.text },
                quantityError && styles.textInputError,
              ]}
              value={quantityText}
            />
            {quantityError ? <Text style={[styles.errorText, { color: theme.danger }]}>{quantityError}</Text> : null}
          </View>
        </View>
      </> : null,
        styleListHeader: type === 'best50' ? <View style={[styles.overflowStyleRow, { borderBottomColor: theme.border }]}>
        <View style={styles.overflowCopy}>
          <Text style={[styles.styleName, { color: theme.text }]}>Selection</Text>
          <Text style={[styles.styleValue, { color: theme.textMuted }]}>追加成绩数量</Text>
        </View>
        <View style={styles.overflowChoices}>
          {SELECTION_COUNTS.map((count) => (
            <BestImageChoiceChip
              key={count}
              label={`${count} 个`}
              selected={stylePrefs.selectionCount === count}
              onPress={() => setStylePrefs((current) => ({ ...current, selectionCount: count }))}
              styles={{ chip: styles.chip, chipText: styles.chipText }}
            />
          ))}
        </View>
      </View> : null,
        styleRows: <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="选择角色"
          onPress={() => setPicker('character')}
          style={({ pressed }) => [
            styles.styleRow,
            { borderBottomColor: theme.border },
            pressed && { backgroundColor: theme.surfaceMuted },
          ]}
        >
          <View style={styles.stylePreview}>{characterStylePreview()}</View>
          <View style={styles.styleCopy}>
            <Text style={[styles.styleName, { color: theme.text }]}>角色</Text>
            <Text numberOfLines={1} style={[styles.styleValue, { color: theme.textMuted }]}>
              {characterStyleValue()}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
        </Pressable>
        <Pressable onPress={() => setPicker('plate')} style={({ pressed }) => [styles.styleRow, { borderBottomColor: theme.border }, pressed && { backgroundColor: theme.surfaceMuted }]}>
          <View style={styles.stylePreview}>
            {assets?.plate ? <Image source={{ uri: assets.plate }} style={styles.platePreview} resizeMode="contain" /> : <Text style={[styles.noAsset, { color: theme.textMuted }]}>默认板</Text>}
          </View>
          <View style={styles.styleCopy}>
            <Text style={[styles.styleName, { color: theme.text }]}>名牌</Text>
            <Text numberOfLines={1} style={[styles.styleValue, { color: theme.textMuted }]}>{plateStyleValue}</Text>
          </View>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="选择称号" onPress={() => setPicker('trophy')} style={({ pressed }) => [styles.styleRow, { borderBottomColor: theme.border }, pressed && { backgroundColor: theme.surfaceMuted }]}>
          <View style={styles.stylePreview}>{stylePrefs.trophy.mode === 'off' ? <Text style={[styles.noAsset, { color: theme.textMuted }]}>已关闭</Text> : <ChunithmBestImageTrophyPreview trophy={selectedTrophy ? { ...selectedTrophy, name: selectedTrophy.name ?? '' } : null} />}</View>
          <View style={styles.styleCopy}>
            <Text style={[styles.styleName, { color: theme.text }]}>称号</Text>
            <Text numberOfLines={1} style={[styles.styleValue, { color: theme.textMuted }]}>{stylePrefs.trophy.mode === 'current' ? '玩家当前称号' : stylePrefs.trophy.mode === 'off' ? '已关闭' : `${stylePrefs.trophy.mode === 'random' ? '随机 · ' : ''}${selectedTrophy?.name ?? '未设置'}`}</Text>
          </View>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="选择歌曲背景"
          onPress={() => setPicker('background')}
          style={({ pressed }) => [
            styles.styleRow,
            { borderBottomColor: theme.border },
            pressed && { backgroundColor: theme.surfaceMuted },
          ]}
        >
          <View style={styles.stylePreview}>
            {backgroundPreviewUri ? (
              <Image source={{ uri: backgroundPreviewUri }} style={styles.backgroundPreview} resizeMode="cover" />
            ) : (
              <View style={[styles.defaultBackgroundPreview, { backgroundColor: theme.surfaceMuted }]} />
            )}
          </View>
          <View style={styles.styleCopy}>
            <Text style={[styles.styleName, { color: theme.text }]}>背景</Text>
            <Text numberOfLines={1} style={[styles.styleValue, { color: theme.textMuted }]}>
              {backgroundStyleValue}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
        </Pressable>
      </>,
        widths: WIDTHS,
        activeWidth: width,
        onChooseWidth: setWidth,
        dimensionMeta: `${width} × ${outputHeight} px · 每页最多 ${type === 'custom' ? `${CUSTOM_MAX_ROWS_PER_PAGE} 行` : `${50 + stylePrefs.selectionCount} 张`} · 第 ${pageIndex + 1}/${pages.length} 页`,
        preparation: { drawingReady, drawingProgress, gameProgress: .8 * jackets.progress + .2 * templateProgress, gameReady: gameReady && jackets.ready && controller.prefsReady && templateReady, error: sourceError ?? assetError ?? jackets.error, retry: () => { retryAssets(); jackets.retry(); retryTemplate(); } },
        pickers: <>
        <ChunithmBestImageStylePicker
          visible={picker === 'character'}
          items={characters.data?.items ?? []}
          isLoading={characters.isPending}
          isError={characters.isError}
          onRetry={() => { void characters.refetch(); }}
          selection={stylePrefs.character}
          onClose={() => setPicker(null)}
          onSelect={(choice) => chooseStyle('character', choice)}
        />
        <ChunithmBestImageStylePicker
          kind="plate"
          visible={picker === 'plate'}
          items={plates.data?.items ?? []}
          isLoading={plates.isPending}
          isError={plates.isError}
          onRetry={() => { void plates.refetch(); }}
          selection={stylePrefs.plate}
          onClose={() => setPicker(null)}
          onSelect={(choice) => chooseStyle('plate', choice)}
        />
        <ChunithmBestImageStylePicker
          kind="trophy"
          visible={picker === 'trophy'}
          items={trophies.data?.items ?? []}
          isLoading={trophies.isPending}
          isError={trophies.isError}
          onRetry={() => { void trophies.refetch(); }}
          selection={stylePrefs.trophy}
          onClose={() => setPicker(null)}
          onSelect={(choice) => chooseStyle('trophy', choice)}
        />
        <ChunithmBestImageBackgroundPicker
          visible={picker === 'background'}
          songs={catalog?.songs ?? []}
          selection={stylePrefs.background}
          onClose={() => setPicker(null)}
          onSelect={(choice) => {
            setStylePrefs((current) => ({ ...current, background: choice }));
            setPicker(null);
          }}
        />
      </>,
        styles: styles,
      }}
      preview={{
        previewTestIdPrefix: "chunithm-best-image",
        sources: sources,
        previewStates,
        pages: pages,
        pageIndex: pageIndex,
        onPageIndexChange: setPageIndex,
        onPreviewStatesChange: setPreviewStates,
        onPreviewMessage: handlePreviewMessage,
        fileAccessFromFileURLs: true,
        allowingReadAccessToUrl: assetSession.directory.uri,
      }}
      exportSession={{
        exportDisabled: !sources || !!exportStatus || !formValid,
        exportSpinner: exportStatus !== null,
        exportIdleLabel: "导出到相册",
        exportStatus: exportStatus,
        onExport: () => void exportImages(),
        exportIndex: exportIndex,
        exportHeight: exportHeight,
        exportSource: exportIndex !== null && webViewSources?.[exportIndex] ? webViewSources[exportIndex]! : null,
        exportWebViewKeyPrefix: "chunithm-export",
        captureRef: exportCaptureRef,
        captureAccessibilityLabel: exportIndex !== null ? `导出画布 第${exportIndex + 1}页` : undefined,
        onExportMessage: handleExportMessage,
        onExportLayout: handleExportLayout,
        onRequestCloseExport: cancelExportRequest,
      }}
    />
  );
}

const chunithmStyles = StyleSheet.create({
  textFieldWrap: { flex: 1, minWidth: 0, gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700' },
  errorText: { fontSize: 11, fontWeight: '600' },
  platePreview: { width: 100, height: 40 },
  characterPreview: { width: 46, height: 46, borderRadius: 10 },
  backgroundPreview: { width: 82, height: 46, borderRadius: 8 },
  defaultBackgroundPreview: { width: 82, height: 46, borderRadius: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
});

const styles = { ...bestImageScreenSharedStyles, ...chunithmStyles };

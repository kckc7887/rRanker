import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
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
import { ChunithmBestImageStylePicker } from '@/features/chunithm-best-image/chunithm-best-image-style-picker';
import type { ChunithmBestImageCollectionItem } from '@/features/chunithm-best-image/load-chunithm-best-image-collections';
import { loadChunithmBestImageCharacters } from '@/features/chunithm-best-image/load-chunithm-best-image-collections';
import {
  loadChunithmBestImageJackets,
  loadChunithmRemoteImageDataUri,
  resolveChunithmBestImageJacketId,
} from '@/features/chunithm-best-image/load-chunithm-best-image-jackets';
import { buildChunithmBestImageHtml } from '@/features/chunithm-best-image/build-chunithm-best-image-html';
import {
  buildChunithmScoreCards,
  compareChunithmScores,
} from '@/domain/chunithm-score-presentation';
import { CHUNITHM_DIFFICULTY_LABELS } from '@/domain/chunithm';
import { buildChunithmCharacterUrl } from '@/domain/chunithm-personal';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { useGameData } from '@/hooks/use-game-data';
import { useAppTheme } from '@/theme/app-theme';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { bestImageExportFilename } from '@/features/best-image/best-image-export';
import {
  BestImageChoiceChip,
  BestImageScreenShell,
  bestImageScreenSharedStyles,
} from '@/features/best-image/best-image-screen-shell';
import { useBestImageScreenController } from '@/features/best-image/use-best-image-screen-controller';
import {
  inlineBestImageWebViewSources,
  prepareAndroidBestImageWebViewSources,
  type BestImageWebViewSource,
} from '@/features/best-image/prepare-best-image-webview-sources';

const WIDTHS = [1080, 1440, 2160] as const;
const SELECTION_COUNTS: readonly ChunithmBestImageSelectionCount[] = [0, 5, 10];
const IMAGE_TYPES: readonly { id: ChunithmBestImageType; label: string }[] = [
  { id: 'best50', label: 'Best50' },
  { id: 'custom', label: '自定义' },
];
/** 自定义模式每页最多 50 行，每行 5 张。 */
const CUSTOM_MAX_ROWS_PER_PAGE = 50;

const chunithmPreferencesAdapter = {
  load: (accountId: string) => chunithmBestImagePreferencesStore.load(accountId),
  save: (accountId: string, prefs: typeof DEFAULT_CHUNITHM_BEST_IMAGE_STYLES) => chunithmBestImagePreferencesStore.save(accountId, prefs),
};

export function ChunithmBestImageScreen() {
  const theme = useAppTheme();
  const lifecycle = useAppLifecycle();
  const gameData = useGameData();
  const catalogQuery = useChunithmCatalog();
  const payload = gameData.data?.payload.kind === 'chunithm' ? gameData.data.payload : null;
  const catalog = catalogQuery.data;

  const [customFilters, setCustomFilters] = useState<CustomChunithmBestImageFilters>(DEFAULT_CUSTOM_CHUNITHM_BEST_IMAGE_FILTERS);
  const [characters, setCharacters] = useState<ChunithmBestImageCollectionItem[] | null>(null);
  const [coverUrls, setCoverUrls] = useState<Record<string, string | null> | null>(null);
  const [characterDataUri, setCharacterDataUri] = useState<string | null>(null);
  const [assetProgress, setAssetProgress] = useState({ done: 0, total: 0 });
  const [sources, setSources] = useState<BestImageWebViewSource[] | null>(null);
  const [androidSources, setAndroidSources] = useState<BestImageWebViewSource[] | null>(null);
  const styleAssetKeyRef = useRef<string | null>(null);
  const randomizedRef = useRef(new Set<string>());

  const controller = useBestImageScreenController<ChunithmBestImageType, typeof DEFAULT_CHUNITHM_BEST_IMAGE_STYLES, 'character' | 'background'>({
    accountId: gameData.activeAccountId,
    defaultType: 'best50',
    defaultWidth: 1080,
    defaultQuantityText: String(DEFAULT_CUSTOM_CHUNITHM_BEST_IMAGE_FILTERS.quantity),
    defaultPreferences: DEFAULT_CHUNITHM_BEST_IMAGE_STYLES,
    preferences: chunithmPreferencesAdapter,
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
    randomizedRef.current.clear();
  }, [gameData.activeAccountId]);

  useEffect(() => {
    let cancelled = false;
    void loadChunithmBestImageCharacters().then((loaded) => {
      if (!cancelled) setCharacters(loaded);
    }).catch(() => {
      if (!cancelled) setCharacters([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!controller.prefsReady || !characters) return;
    const accountKey = gameData.activeAccountId;
    const choice = stylePrefs.character;
    const randomKey = `${accountKey}:character`;
    const needsUpdate = choice.mode === 'random'
      && typeof choice.id !== 'number'
      && !randomizedRef.current.has(randomKey);
    if (!needsUpdate) return;
    setStylePrefs((current) => {
      if (current.character.mode !== 'random' || typeof current.character.id === 'number') return current;
      randomizedRef.current.add(randomKey);
      const item = characters[Math.floor(Math.random() * characters.length)];
      return item
        ? { ...current, character: { mode: 'random', id: item.id, name: item.name } }
        : current;
    });
  }, [characters, controller.prefsReady, gameData.activeAccountId, setStylePrefs, stylePrefs.character]);

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
  const jacketKey = jacketIds.join('|');

  useEffect(() => {
    let cancelled = false;
    if (!payload || !lifecycle.foregroundReady) return;
    setCoverUrls(null);
    setAssetProgress({ done: 0, total: jacketIds.length });
    void loadChunithmBestImageJackets(jacketIds, (done, total) => {
      if (!cancelled) setAssetProgress({ done, total });
    }).then((loaded) => {
      if (!cancelled) setCoverUrls(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [jacketKey, jacketIds, lifecycle.foregroundGeneration, lifecycle.foregroundReady, payload]);

  const characterId = useMemo(
    () => resolveChunithmBestImageStyleId(stylePrefs.character, payload?.player?.character?.id),
    [payload?.player?.character?.id, stylePrefs.character],
  );
  const hideCharacter = stylePrefs.character.mode === 'off'
    || ((stylePrefs.character.mode === 'item' || stylePrefs.character.mode === 'random') && characterId === null);
  const styleAssetKey = [stylePrefs.character.mode, characterId ?? ''].join('|');

  useEffect(() => {
    let cancelled = false;
    if (!payload || !lifecycle.foregroundReady) return;
    if (styleAssetKeyRef.current === styleAssetKey) return;
    const pending = hideCharacter || characterId === null
      ? Promise.resolve(null)
      : loadChunithmRemoteImageDataUri(buildChunithmCharacterUrl(characterId));
    void pending.then((nextCharacter) => {
      if (cancelled) return;
      styleAssetKeyRef.current = styleAssetKey;
      setCharacterDataUri(nextCharacter);
    });
    return () => {
      cancelled = true;
    };
  }, [
    characterId,
    hideCharacter,
    payload,
    styleAssetKey,
    lifecycle.foregroundGeneration,
    lifecycle.foregroundReady,
  ]);

  const backgroundDataUri = backgroundJacketId
    ? coverUrls?.[backgroundJacketId] ?? null
    : null;

  const htmlPages = useMemo(() => {
    if (!payload || !coverUrls) return null;
    return pages.map((page) => buildChunithmBestImageHtml({
      type,
      width,
      player: payload.player,
      ratingDisplay: payload.playerScore.display,
      page,
      coverUrls,
      jacketIds: jacketIdsByKey,
      characterDataUri,
      backgroundDataUri,
      hideCharacter,
      dataSource: payload.source.label,
    }));
  }, [
    backgroundDataUri,
    characterDataUri,
    coverUrls,
    hideCharacter,
    jacketIdsByKey,
    pages,
    payload,
    type,
    width,
  ]);

  const inlineSources = useMemo(
    () => (htmlPages ? inlineBestImageWebViewSources(htmlPages) : null),
    [htmlPages],
  );

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!htmlPages) {
      setAndroidSources(null);
      return;
    }
    const prepared = prepareAndroidBestImageWebViewSources(htmlPages);
    setAndroidSources(prepared.sources);
    return prepared.dispose;
  }, [htmlPages]);

  useEffect(() => {
    setPageHeights({});
    setPageIndex(0);
    setPreviewStates({});
    setSources(Platform.OS === 'android' ? androidSources : inlineSources);
  }, [androidSources, inlineSources, setPageHeights, setPageIndex, setPreviewStates]);

  const currentPage = pages[Math.min(pageIndex, pages.length - 1)]!;
  const outputHeight = pageHeights[currentPage.id] ?? Math.ceil(width * 0.75);
  const webViewSources = Platform.OS === 'android' ? androidSources : inlineSources;

  const chooseStyle = (choice: ChunithmBestImageStyleChoice) => {
    if (choice.mode === 'random') {
      randomizedRef.current.add(`${gameData.activeAccountId}:character`);
    }
    setStylePrefs((current) => ({ ...current, character: choice }));
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
      imageTypes={IMAGE_TYPES}
      activeType={type}
      onSelectType={setType}
      customPanelBody={type === 'custom' ? <>
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
      </> : null}
      styleListHeader={type === 'best50' ? <View style={[styles.overflowStyleRow, { borderBottomColor: theme.border }]}>
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
      </View> : null}
      styleRows={<>
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
      </>}
      widths={WIDTHS}
      activeWidth={width}
      onChooseWidth={setWidth}
      dimensionMeta={`${width} × ${outputHeight} px · 每页最多 ${type === 'custom' ? `${CUSTOM_MAX_ROWS_PER_PAGE} 行` : `${50 + stylePrefs.selectionCount} 张`} · 第 ${pageIndex + 1}/${pages.length} 页`}
      previewTestIdPrefix="chunithm-best-image"
      sources={sources}
      pages={pages}
      pageIndex={pageIndex}
      onPageIndexChange={setPageIndex}
      onPreviewStatesChange={setPreviewStates}
      onPreviewMessage={handlePreviewMessage}
      fileAccessFromFileURLs={false}
      allowingReadAccessToUrl={undefined}
      loadingPreview={(
        <View style={styles.loadingContent}>
          <ActivityIndicator accessibilityLabel="正在加载预览素材" color={theme.accent} size="large" />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>
            {assetProgress.total > 0
              ? `正在准备歌曲封面 ${assetProgress.done}/${assetProgress.total}`
              : '正在准备预览'}
          </Text>
        </View>
      )}
      fontStatus={null}
      fontStatusAboveDots={false}
      exportDisabled={!sources || !!exportStatus || !formValid}
      exportSpinner={exportStatus !== null}
      exportIdleLabel="导出到相册"
      exportStatus={exportStatus}
      onExport={() => void exportImages()}
      exportIndex={exportIndex}
      exportHeight={exportHeight}
      exportSource={exportIndex !== null && webViewSources?.[exportIndex] ? webViewSources[exportIndex]! : null}
      exportWebViewKeyPrefix="chunithm-export"
      captureRef={exportCaptureRef}
      captureAccessibilityLabel={exportIndex !== null ? `导出画布 第${exportIndex + 1}页` : undefined}
      onExportMessage={handleExportMessage}
      onRequestCloseExport={cancelExportRequest}
      onReleaseHeavySources={() => {
        setSources(null);
        setAndroidSources(null);
        setCoverUrls(null);
        setCharacterDataUri(null);
        styleAssetKeyRef.current = null;
      }}
      pickers={<>
        <ChunithmBestImageStylePicker
          visible={picker === 'character'}
          items={characters ?? []}
          selection={stylePrefs.character}
          onClose={() => setPicker(null)}
          onSelect={chooseStyle}
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
      </>}
      styles={styles}
    />
  );
}

const chunithmStyles = StyleSheet.create({
  // 中二差异键：数量输入行（fieldLabel 无 marginBottom、textFieldWrap 带 gap 汇聚）
  // 与错误文案、角色/背景预览尺寸、空数据居中容器。
  textFieldWrap: { flex: 1, minWidth: 0, gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700' },
  errorText: { fontSize: 11, fontWeight: '600' },
  characterPreview: { width: 46, height: 46, borderRadius: 10 },
  backgroundPreview: { width: 82, height: 46, borderRadius: 8 },
  defaultBackgroundPreview: { width: 82, height: 46, borderRadius: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
});

/** 共享骨架样式 + 中二差异覆盖。 */
const styles = { ...bestImageScreenSharedStyles, ...chunithmStyles };

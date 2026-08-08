import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';
import { useNotification } from '@/components/AppNotification';
import { ChunithmFilterBar } from '@/components/chunithm/ChunithmFilterBar';
import {
  parseBestImageHeightMessage,
  parseBestImageReadyMessage,
  parseBestImageRuntimeMessage,
} from '@/features/best-image/build-best-image-html';
import {
  bestImageCaptureDimensions,
  bestImageExportFilename,
  deleteBestImageCapture,
  isDrawViewHierarchyError,
  requestBestImageExportPermission,
  saveBestImageCapture,
  shouldUseBestImageRenderInContext,
} from '@/features/best-image/best-image-export';
import {
  inlineBestImageWebViewSources,
  prepareAndroidBestImageWebViewSources,
  type BestImageWebViewSource,
} from '@/features/best-image/prepare-best-image-webview-sources';
import { buildChunithmBestImageHtml } from '@/features/chunithm-best-image/build-chunithm-best-image-html';
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
  chunithmBestImageJacketUrl,
  loadChunithmBestImageJackets,
  loadChunithmRemoteImageDataUri,
  resolveChunithmBestImageJacketId,
} from '@/features/chunithm-best-image/load-chunithm-best-image-jackets';
import {
  buildChunithmScoreCards,
  compareChunithmScores,
} from '@/domain/chunithm-score-presentation';
import { CHUNITHM_DIFFICULTY_LABELS } from '@/domain/chunithm';
import { buildChunithmCharacterUrl } from '@/domain/chunithm-personal';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { useGameData } from '@/hooks/use-game-data';
import { useAppTheme } from '@/theme/app-theme';

const WIDTHS = [1080, 1440, 2160] as const;
const SELECTION_COUNTS: readonly ChunithmBestImageSelectionCount[] = [0, 5, 10];
const IMAGE_TYPES: readonly { id: ChunithmBestImageType; label: string }[] = [
  { id: 'best50', label: 'Best50' },
  { id: 'custom', label: '自定义' },
];
/** 自定义模式每页最多 50 行，每行 5 张。 */
const CUSTOM_MAX_ROWS_PER_PAGE = 50;

type PreviewPhase = 'loading' | 'loaded' | 'rendering' | 'ready' | 'error' | 'crashed' | 'terminated';

const PREVIEW_PHASE_LABEL: Record<PreviewPhase, string> = {
  loading: '正在加载',
  loaded: '页面已载入，等待渲染',
  rendering: '正在渲染',
  ready: '渲染就绪',
  error: '加载失败',
  crashed: '渲染进程崩溃',
  terminated: '渲染进程已终止',
};

function ChoiceChip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: theme.surface, borderColor: theme.border },
        selected && { backgroundColor: theme.accentSoft, borderColor: theme.accent },
      ]}
    >
      <Text style={[styles.chipText, { color: theme.textSecondary }, selected && { color: theme.accent }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChunithmBestImageScreen() {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const gameData = useGameData();
  const catalogQuery = useChunithmCatalog();
  const window = useWindowDimensions();
  const payload = gameData.data?.payload.kind === 'chunithm' ? gameData.data.payload : null;
  const catalog = catalogQuery.data;

  const [width, setWidth] = useState<(typeof WIDTHS)[number]>(1080);
  const [type, setType] = useState<ChunithmBestImageType>('best50');
  const [quantityText, setQuantityText] = useState(String(DEFAULT_CUSTOM_CHUNITHM_BEST_IMAGE_FILTERS.quantity));
  const [customFilters, setCustomFilters] = useState<CustomChunithmBestImageFilters>(DEFAULT_CUSTOM_CHUNITHM_BEST_IMAGE_FILTERS);
  const [stylePrefs, setStylePrefs] = useState(DEFAULT_CHUNITHM_BEST_IMAGE_STYLES);
  const [prefsReady, setPrefsReady] = useState(false);
  const [characters, setCharacters] = useState<ChunithmBestImageCollectionItem[] | null>(null);
  const [picker, setPicker] = useState<'character' | 'background' | null>(null);
  const [coverUrls, setCoverUrls] = useState<Record<string, string | null> | null>(null);
  const [characterDataUri, setCharacterDataUri] = useState<string | null>(null);
  const [assetProgress, setAssetProgress] = useState({ done: 0, total: 0 });
  const [sources, setSources] = useState<BestImageWebViewSource[] | null>(null);
  const [androidSources, setAndroidSources] = useState<BestImageWebViewSource[] | null>(null);
  const [pageHeights, setPageHeights] = useState<Record<string, number>>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [previewStates, setPreviewStates] = useState<Record<string, { phase: PreviewPhase; version: string | null }>>({});
  const [exportIndex, setExportIndex] = useState<number | null>(null);
  const [exportHeight, setExportHeight] = useState(810);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const exportCaptureRef = useRef<View>(null);
  const exportResolve = useRef<((height: number) => void) | null>(null);
  const exportReject = useRef<((error: Error) => void) | null>(null);
  const exportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styleAssetKeyRef = useRef<string | null>(null);
  const randomizedRef = useRef(new Set<string>());

  useEffect(() => {
    setPrefsReady(false);
    void chunithmBestImagePreferencesStore.load(gameData.activeAccountId).then((value) => {
      setStylePrefs(value);
      setPrefsReady(true);
    });
  }, [gameData.activeAccountId]);

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
    if (!prefsReady || !characters) return;
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
  }, [characters, gameData.activeAccountId, prefsReady, stylePrefs.character]);

  useEffect(() => {
    if (prefsReady) {
      void chunithmBestImagePreferencesStore.save(gameData.activeAccountId, stylePrefs);
    }
  }, [gameData.activeAccountId, prefsReady, stylePrefs]);

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
    if (!payload) return;
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
  }, [jacketKey, jacketIds, payload]);

  const characterId = useMemo(
    () => resolveChunithmBestImageStyleId(stylePrefs.character, payload?.player?.character?.id),
    [payload?.player?.character?.id, stylePrefs.character],
  );
  const hideCharacter = stylePrefs.character.mode === 'off'
    || ((stylePrefs.character.mode === 'item' || stylePrefs.character.mode === 'random') && characterId === null);
  const styleAssetKey = [stylePrefs.character.mode, characterId ?? ''].join('|');

  useEffect(() => {
    let cancelled = false;
    if (!payload) return;
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
  }, [androidSources, inlineSources]);

  const currentPage = pages[Math.min(pageIndex, pages.length - 1)]!;
  const outputHeight = pageHeights[currentPage.id] ?? Math.ceil(width * 0.75);
  const screenWidth = window.width > 0 ? window.width : 390;
  const previewWidth = Math.min(720, Math.max(280, screenWidth - 32));
  const previewHeight = previewWidth * 4 / 3;
  const currentPreviewState = previewStates[currentPage.id];
  const previewStatus = currentPreviewState
    ? `${PREVIEW_PHASE_LABEL[currentPreviewState.phase]}${currentPreviewState.version ? ` · WebView ${currentPreviewState.version}` : ''}`
    : 'WebView 版本未知 · 等待预览素材';
  const webViewSources = Platform.OS === 'android' ? androidSources : inlineSources;

  const updatePreviewState = (pageId: string, phase: PreviewPhase, version?: string | null) => {
    setPreviewStates((current) => ({
      ...current,
      [pageId]: {
        phase,
        version: version === undefined ? current[pageId]?.version ?? null : version,
      },
    }));
  };

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
  const backgroundPreviewUri = backgroundDataUri
    ?? (backgroundSong ? chunithmBestImageJacketUrl(String(backgroundSong.id)) : null);

  const waitForExport = (index: number) => new Promise<number>((resolve, reject) => {
    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportResolve.current = resolve;
    exportReject.current = reject;
    setExportHeight(pageHeights[pages[index]!.id] ?? Math.ceil(width * 0.75));
    setExportIndex(index);
    exportTimer.current = setTimeout(() => {
      exportResolve.current = null;
      exportReject.current = null;
      reject(new Error('图片渲染超时'));
    }, 30_000);
  });

  const handleExportMessage = (value: string) => {
    const measured = parseBestImageHeightMessage(value, width, 1);
    if (measured != null) setExportHeight(measured);
    const ready = parseBestImageReadyMessage(value, width, 1);
    if (ready == null || !exportResolve.current) return;
    setExportHeight(ready);
    const resolve = exportResolve.current;
    exportResolve.current = null;
    exportReject.current = null;
    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportTimer.current = null;
    setTimeout(() => resolve(ready), 320);
  };

  const exportImages = async () => {
    if (!payload || !webViewSources || !htmlPages || !formValid || exportStatus) return;
    const captures: { uri: string; filename: string }[] = [];
    try {
      await requestBestImageExportPermission();
      for (let index = 0; index < webViewSources.length; index += 1) {
        setExportStatus(`正在导出 ${index + 1}/${webViewSources.length}`);
        const height = await waitForExport(index);
        const dimensions = bestImageCaptureDimensions(width, height, PixelRatio.get(), Platform.OS);
        const useRenderInContext = shouldUseBestImageRenderInContext(Platform.OS, width, height);
        const options = {
          format: 'png' as const,
          quality: 1,
          result: 'tmpfile' as const,
          ...dimensions,
          ...(useRenderInContext ? { useRenderInContext: true } : {}),
        };
        let uri: string;
        try {
          uri = await captureRef(exportCaptureRef, options);
        } catch (error) {
          if (Platform.OS !== 'ios' || useRenderInContext || !isDrawViewHierarchyError(error)) {
            throw error;
          }
          uri = await captureRef(exportCaptureRef, { ...options, useRenderInContext: true });
        }
        captures.push({
          uri,
          filename: bestImageExportFilename(
            payload.player?.name ?? 'player',
            type,
            index,
            webViewSources.length,
          ),
        });
      }
      setExportIndex(null);
      for (const [index, capture] of captures.entries()) {
        setExportStatus(`正在保存 ${index + 1}/${captures.length}`);
        await saveBestImageCapture(capture.uri, capture.filename);
      }
      showNotification({
        title: '导出完成',
        message: `已保存 ${captures.length} 张成绩图片到相册`,
        variant: 'success',
      });
    } catch (error) {
      showNotification({
        title: '导出失败',
        message: error instanceof Error ? error.message : '无法导出成绩图片',
        variant: 'error',
      });
    } finally {
      if (exportTimer.current) clearTimeout(exportTimer.current);
      exportResolve.current = null;
      exportReject.current = null;
      setExportIndex(null);
      setExportStatus(null);
      captures.forEach((item) => deleteBestImageCapture(item.uri));
    }
  };

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

  if (!payload && !gameData.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textMuted }}>当前账号没有可生成的中二节奏成绩</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={[styles.page, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.label, { color: theme.text }]}>选择类型</Text>
        <View
          accessibilityRole="tablist"
          style={[styles.segmentedControl, { backgroundColor: theme.surfaceMuted }]}
        >
          {IMAGE_TYPES.map((item) => {
            const selected = type === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityLabel={item.label}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setType(item.id)}
                style={[styles.segment, selected && { backgroundColor: theme.surface }]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: theme.textMuted },
                    selected && { color: theme.accent },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {type === 'custom' ? <View style={[styles.customPanel, { backgroundColor: theme.surface }]}>
          <Text style={[styles.panelTitle, { color: theme.text }]}>自定义 BestN</Text>
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
        </View> : null}

        <Text style={[styles.label, styles.sectionLabel, { color: theme.text }]}>样式选择</Text>
        <View style={[styles.styleList, { backgroundColor: theme.surface }]}>
          {type === 'best50' ? <View style={[styles.overflowStyleRow, { borderBottomColor: theme.border }]}>
            <View style={styles.overflowCopy}>
              <Text style={[styles.styleName, { color: theme.text }]}>Selection</Text>
              <Text style={[styles.styleValue, { color: theme.textMuted }]}>追加成绩数量</Text>
            </View>
            <View style={styles.overflowChoices}>
              {SELECTION_COUNTS.map((count) => (
                <ChoiceChip
                  key={count}
                  label={`${count} 个`}
                  selected={stylePrefs.selectionCount === count}
                  onPress={() => setStylePrefs((current) => ({ ...current, selectionCount: count }))}
                />
              ))}
            </View>
          </View> : null}
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
        </View>

        <Text style={[styles.label, styles.sectionLabel, { color: theme.text }]}>分辨率</Text>
        <View style={styles.widthOptions}>
          {WIDTHS.map((item) => {
            const selected = width === item;
            return (
              <Pressable
                key={item}
                accessibilityLabel={`宽度 ${item} 像素`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setWidth(item)}
                style={[
                  styles.widthOption,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  selected && { borderColor: theme.accent, backgroundColor: theme.accentSoft },
                ]}
              >
                <Text
                  style={[
                    styles.widthOptionText,
                    { color: theme.textMuted },
                    selected && { color: theme.accent },
                  ]}
                >
                  {item}px
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.dimensionMeta, { color: theme.textMuted }]}>
          {width} × {outputHeight} px · 每页最多 {type === 'custom' ? `${CUSTOM_MAX_ROWS_PER_PAGE} 行` : `${50 + stylePrefs.selectionCount} 张`} · 第 {pageIndex + 1}/{pages.length} 页
        </Text>

        <Text style={[styles.label, styles.sectionLabel, { color: theme.text }]}>预览</Text>
        <View
          accessibilityLabel="HTML图片预览窗"
          style={[
            styles.previewFrame,
            {
              width: previewWidth,
              height: previewHeight,
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          {sources ? (
            <FlatList
              data={sources}
              horizontal
              initialNumToRender={2}
              keyExtractor={(_, index) => pages[index]!.id}
              maxToRenderPerBatch={3}
              pagingEnabled
              removeClippedSubviews={false}
              showsHorizontalScrollIndicator={false}
              windowSize={3}
              style={styles.previewPager}
              onMomentumScrollEnd={(event) => {
                setPageIndex(Math.round(event.nativeEvent.contentOffset.x / previewWidth));
              }}
              renderItem={({ item, index }) => {
                const pageId = pages[index]!.id;
                return (
                  <View style={{ width: previewWidth, height: previewHeight }}>
                    <WebView
                      testID={`chunithm-best-image-html-preview-${index}`}
                      accessibilityLabel={`HTML图片预览 第${index + 1}页`}
                      allowFileAccess={Platform.OS === 'android'}
                      bounces={false}
                      javaScriptEnabled
                      mixedContentMode="never"
                      originWhitelist={['*']}
                      scrollEnabled={false}
                      source={item}
                      style={styles.webview}
                      onError={() => updatePreviewState(pageId, 'error')}
                      onLoadStart={() => updatePreviewState(pageId, 'loading')}
                      onLoadEnd={() => setPreviewStates((current) => (
                        current[pageId] && current[pageId]!.phase !== 'loading'
                          ? current
                          : { ...current, [pageId]: { phase: 'loaded', version: current[pageId]?.version ?? null } }
                      ))}
                      onRenderProcessGone={(event) => updatePreviewState(
                        pageId,
                        event.nativeEvent.didCrash ? 'crashed' : 'terminated',
                      )}
                      onMessage={(event) => {
                        const runtime = parseBestImageRuntimeMessage(event.nativeEvent.data, width);
                        if (runtime) updatePreviewState(pageId, 'rendering', runtime.version);
                        const height = parseBestImageHeightMessage(event.nativeEvent.data, width, 1);
                        if (height != null) {
                          setPageHeights((current) => ({ ...current, [pageId]: height }));
                          updatePreviewState(pageId, 'rendering');
                        }
                        const ready = parseBestImageReadyMessage(event.nativeEvent.data, width, 1);
                        if (ready != null) updatePreviewState(pageId, 'ready');
                      }}
                    />
                  </View>
                );
              }}
            />
          ) : (
            <View style={styles.loadingPreview}>
              <View style={styles.loadingContent}>
                <ActivityIndicator accessibilityLabel="正在加载预览素材" color={theme.accent} size="large" />
                <Text style={[styles.loadingText, { color: theme.textMuted }]}>
                  {assetProgress.total > 0
                    ? `正在逐张缓存歌曲封面 ${assetProgress.done}/${assetProgress.total}`
                    : '正在加载预览素材'}
                </Text>
              </View>
            </View>
          )}
        </View>
        {pages.length > 1 ? (
          <View style={styles.pageDots}>
            {pages.map((page, index) => (
              <View
                key={page.id}
                style={[
                  styles.pageDot,
                  { backgroundColor: theme.border },
                  index === pageIndex && { backgroundColor: theme.accent, width: 18 },
                ]}
              />
            ))}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="导出成绩图片"
          disabled={!sources || !!exportStatus || !formValid}
          onPress={() => void exportImages()}
          style={[
            styles.exportButton,
            { backgroundColor: theme.accent },
            (!sources || !!exportStatus || !formValid) && styles.exportButtonDisabled,
          ]}
        >
          {exportStatus ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
          <Text style={styles.exportButtonText}>{exportStatus ?? '导出到相册'}</Text>
        </Pressable>
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.webViewStatusText, { color: theme.textMuted }]}
          testID="chunithm-best-image-webview-status"
        >
          {previewStatus}
        </Text>
      </ScrollView>
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
      <Modal
        visible={exportIndex !== null}
        transparent={false}
        animationType="none"
        onRequestClose={() => exportReject.current?.(new Error('导出已取消'))}
      >
        {exportIndex !== null && webViewSources?.[exportIndex] ? (
          <View style={styles.exportRoot}>
            <View
              accessibilityLabel={`导出画布 第${exportIndex + 1}页`}
              ref={exportCaptureRef}
              collapsable={false}
              style={{
                width: width / PixelRatio.get(),
                height: exportHeight / PixelRatio.get(),
              }}
            >
              <WebView
                accessibilityLabel={`导出渲染 第${exportIndex + 1}页`}
                key={`chunithm-export-${exportIndex}-${width}`}
                allowFileAccess={Platform.OS === 'android'}
                androidLayerType="software"
                bounces={false}
                javaScriptEnabled
                mixedContentMode="never"
                originWhitelist={['*']}
                scrollEnabled={false}
                source={webViewSources[exportIndex]}
                style={styles.webview}
                onMessage={(event) => handleExportMessage(event.nativeEvent.data)}
              />
            </View>
            <View style={[styles.exportOverlay, { backgroundColor: theme.background }]}>
              <ActivityIndicator color={theme.accent} size="large" />
              <Text style={[styles.exportOverlayText, { color: theme.textSecondary }]}>
                {exportStatus ?? '正在准备导出'}
              </Text>
            </View>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, alignItems: 'stretch' },
  label: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  sectionLabel: { marginTop: 24 },
  segmentedControl: { flexDirection: 'row', padding: 4, borderRadius: 14 },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  segmentText: { fontSize: 14, fontWeight: '700' },
  customPanel: { marginTop: 16, padding: 14, gap: 10, borderRadius: 16 },
  panelTitle: { fontSize: 15, fontWeight: '800' },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  textFieldWrap: { flex: 1, minWidth: 0, gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700' },
  textInput: { minHeight: 40, paddingHorizontal: 11, borderWidth: 1, borderRadius: 10, fontSize: 14 },
  textInputError: { borderColor: '#D92D20' },
  errorText: { fontSize: 11, fontWeight: '600' },
  chip: {
    minWidth: 46,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
  styleList: { overflow: 'hidden', borderRadius: 16 },
  overflowStyleRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  overflowCopy: { flex: 1, minWidth: 0 },
  overflowChoices: { flexDirection: 'row', gap: 6 },
  styleRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stylePreview: { width: 132, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  characterPreview: { width: 46, height: 46, borderRadius: 10 },
  backgroundPreview: { width: 82, height: 46, borderRadius: 8 },
  defaultBackgroundPreview: { width: 82, height: 46, borderRadius: 8 },
  styleCopy: { flex: 1, minWidth: 0 },
  styleName: { fontSize: 14, fontWeight: '800' },
  styleValue: { fontSize: 12, marginTop: 3 },
  chevron: { fontSize: 26, fontWeight: '300' },
  noAsset: { fontSize: 12 },
  widthOptions: { flexDirection: 'row', gap: 8 },
  widthOption: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  widthOptionText: { fontSize: 13, fontWeight: '700' },
  dimensionMeta: { fontSize: 12, marginTop: 8, textAlign: 'right' },
  previewFrame: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
  },
  previewPager: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
  loadingPreview: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingContent: { alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 12, fontWeight: '600' },
  pageDots: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pageDot: { width: 6, height: 6, borderRadius: 3 },
  exportButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 14,
    borderRadius: 14,
  },
  exportButtonDisabled: { opacity: 0.55 },
  exportButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  webViewStatusText: { marginTop: 7, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  exportRoot: { flex: 1, overflow: 'hidden', backgroundColor: '#111111' },
  exportOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  exportOverlayText: { fontSize: 14, fontWeight: '700' },
});

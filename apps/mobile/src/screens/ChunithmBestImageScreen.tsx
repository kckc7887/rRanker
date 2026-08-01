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
  useWindowDimensions,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';
import { useNotification } from '@/components/AppNotification';
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
} from '@/features/chunithm-best-image/chunithm-best-image';
import {
  CHUNITHM_BEST_IMAGE_STYLE_KINDS,
  chunithmBestImagePreferencesStore,
  DEFAULT_CHUNITHM_BEST_IMAGE_STYLES,
  resolveChunithmBestImageStyleId,
  type ChunithmBestImageStyleChoice,
  type ChunithmBestImageStyleKind,
} from '@/features/chunithm-best-image/chunithm-best-image-preferences';
import { ChunithmBestImageStylePicker } from '@/features/chunithm-best-image/chunithm-best-image-style-picker';
import type { ChunithmBestImageCollectionItem } from '@/features/chunithm-best-image/load-chunithm-best-image-collections';
import { loadChunithmBestImageCollections } from '@/features/chunithm-best-image/load-chunithm-best-image-collections';
import {
  loadChunithmBestImageJackets,
  loadChunithmRemoteImageDataUri,
  resolveChunithmBestImageJacketId,
} from '@/features/chunithm-best-image/load-chunithm-best-image-jackets';
import {
  buildChunithmScoreCards,
  compareChunithmScores,
} from '@/domain/chunithm-score-presentation';
import {
  buildChunithmCharacterUrl,
  buildChunithmNamePlateUrl,
  buildChunithmTrophyUrl,
} from '@/domain/chunithm-personal';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { useGameData } from '@/hooks/use-game-data';
import { useAppTheme } from '@/theme/app-theme';

const WIDTHS = [1080, 1440, 2160] as const;
const SELECTION_COUNTS: readonly ChunithmBestImageSelectionCount[] = [0, 5, 10];
const STYLE_LABELS: Record<ChunithmBestImageStyleKind, string> = {
  character: '角色',
  plate: '名牌板',
  trophy: '称号',
};

function resolvedRandom<T>(items: readonly T[], seed: string): T | undefined {
  if (!items.length) return undefined;
  let hash = 0;
  for (const character of seed) hash = ((hash * 31) + character.charCodeAt(0)) | 0;
  return items[Math.abs(hash) % items.length];
}

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
  const [stylePrefs, setStylePrefs] = useState(DEFAULT_CHUNITHM_BEST_IMAGE_STYLES);
  const [prefsReady, setPrefsReady] = useState(false);
  const [collections, setCollections] = useState<Record<ChunithmBestImageStyleKind, ChunithmBestImageCollectionItem[]> | null>(null);
  const [picker, setPicker] = useState<ChunithmBestImageStyleKind | null>(null);
  const [coverUrls, setCoverUrls] = useState<Record<string, string | null> | null>(null);
  const [characterDataUri, setCharacterDataUri] = useState<string | null>(null);
  const [plateDataUri, setPlateDataUri] = useState<string | null>(null);
  const [trophyDataUri, setTrophyDataUri] = useState<string | null>(null);
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
    void loadChunithmBestImageCollections().then((loaded) => {
      if (!cancelled) setCollections(loaded);
    }).catch(() => {
      if (!cancelled) {
        setCollections({ character: [], plate: [], trophy: [] });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!prefsReady || !collections) return;
    const accountKey = gameData.activeAccountId;
    const needsUpdate = CHUNITHM_BEST_IMAGE_STYLE_KINDS.some((kind) => {
      const choice = stylePrefs[kind];
      if (choice.mode !== 'random') return false;
      if (typeof choice.id === 'number') return false;
      return !randomizedRef.current.has(`${accountKey}:${kind}`);
    });
    if (!needsUpdate) return;
    setStylePrefs((current) => {
      const next = { ...current };
      let changed = false;
      for (const kind of CHUNITHM_BEST_IMAGE_STYLE_KINDS) {
        const choice = current[kind];
        if (choice.mode !== 'random' || typeof choice.id === 'number') continue;
        const randomKey = `${accountKey}:${kind}`;
        if (randomizedRef.current.has(randomKey)) continue;
        randomizedRef.current.add(randomKey);
        const items = collections[kind];
        const item = items.length
          ? items[Math.floor(Math.random() * items.length)]!
          : resolvedRandom(items, `${accountKey}:${kind}`);
        if (item) {
          next[kind] = { mode: 'random', id: item.id, name: item.name };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [collections, gameData.activeAccountId, prefsReady, stylePrefs]);

  useEffect(() => {
    if (prefsReady) {
      void chunithmBestImagePreferencesStore.save(gameData.activeAccountId, stylePrefs);
    }
  }, [gameData.activeAccountId, prefsReady, stylePrefs]);

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

  const sections = useMemo(
    () => appendChunithmSelectionScores(baseSections, selectionCards, stylePrefs.selectionCount),
    [baseSections, selectionCards, stylePrefs.selectionCount],
  );

  const pages = useMemo(
    () => paginateChunithmBestImageSections(sections, 50 + stylePrefs.selectionCount),
    [sections, stylePrefs.selectionCount],
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

  const jacketIds = useMemo(
    () => [...new Set(Object.values(jacketIdsByKey))],
    [jacketIdsByKey],
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
  const plateId = useMemo(
    () => resolveChunithmBestImageStyleId(stylePrefs.plate, payload?.player?.name_plate?.id),
    [payload?.player?.name_plate?.id, stylePrefs.plate],
  );
  const trophyId = useMemo(
    () => resolveChunithmBestImageStyleId(stylePrefs.trophy, payload?.player?.trophy?.id),
    [payload?.player?.trophy?.id, stylePrefs.trophy],
  );
  const hideCharacter = stylePrefs.character.mode === 'off'
    || ((stylePrefs.character.mode === 'item' || stylePrefs.character.mode === 'random') && characterId === null);
  const hidePlate = stylePrefs.plate.mode === 'off'
    || ((stylePrefs.plate.mode === 'item' || stylePrefs.plate.mode === 'random') && plateId === null);
  const hideTrophy = stylePrefs.trophy.mode === 'off'
    || ((stylePrefs.trophy.mode === 'item' || stylePrefs.trophy.mode === 'random') && trophyId === null);
  const trophyImageUrl = hideTrophy || trophyId === null
    ? null
    : buildChunithmTrophyUrl(trophyId);
  const trophyName = useMemo(() => {
    const choice = stylePrefs.trophy;
    if (choice.mode === 'off') return null;
    if ((choice.mode === 'item' || choice.mode === 'random') && choice.name) return choice.name;
    return payload?.player?.trophy?.name ?? null;
  }, [payload?.player?.trophy?.name, stylePrefs.trophy]);
  const styleAssetKey = [
    stylePrefs.character.mode, characterId ?? '',
    stylePrefs.plate.mode, plateId ?? '',
    stylePrefs.trophy.mode, trophyId ?? '',
  ].join('|');

  useEffect(() => {
    let cancelled = false;
    if (!payload) return;
    if (styleAssetKeyRef.current === styleAssetKey) return;
    void Promise.all([
      hideCharacter || characterId === null
        ? Promise.resolve(null)
        : loadChunithmRemoteImageDataUri(buildChunithmCharacterUrl(characterId)),
      hidePlate || plateId === null
        ? Promise.resolve(null)
        : loadChunithmRemoteImageDataUri(buildChunithmNamePlateUrl(plateId)),
      hideTrophy || trophyId === null
        ? Promise.resolve(null)
        : loadChunithmRemoteImageDataUri(trophyImageUrl),
    ]).then(([nextCharacter, nextPlate, nextTrophy]) => {
      if (cancelled) return;
      styleAssetKeyRef.current = styleAssetKey;
      setCharacterDataUri(nextCharacter);
      setPlateDataUri(nextPlate);
      setTrophyDataUri(nextTrophy);
    });
    return () => {
      cancelled = true;
    };
  }, [
    characterId,
    hideCharacter,
    hidePlate,
    hideTrophy,
    payload,
    plateId,
    styleAssetKey,
    trophyId,
    trophyImageUrl,
  ]);

  const htmlPages = useMemo(() => {
    if (!payload || !coverUrls) return null;
    return pages.map((page) => buildChunithmBestImageHtml({
      type: 'best50',
      width,
      player: payload.player,
      ratingDisplay: payload.playerScore.display,
      page,
      coverUrls,
      jacketIds: jacketIdsByKey,
      characterDataUri,
      plateDataUri,
      trophyDataUri,
      trophyImageUrl,
      trophyName,
      hideCharacter,
      hidePlate,
      hideTrophy,
    }));
  }, [
    characterDataUri,
    coverUrls,
    hideCharacter,
    hidePlate,
    hideTrophy,
    jacketIdsByKey,
    pages,
    payload,
    plateDataUri,
    trophyDataUri,
    trophyImageUrl,
    trophyName,
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
    const kind = picker;
    if (!kind) return;
    if (choice.mode === 'random') {
      randomizedRef.current.add(`${gameData.activeAccountId}:${kind}`);
    }
    setStylePrefs((current) => ({ ...current, [kind]: choice }));
    setPicker(null);
  };

  const styleValue = (kind: ChunithmBestImageStyleKind): string => {
    const choice = stylePrefs[kind];
    if (choice.mode === 'current') return `玩家当前${STYLE_LABELS[kind]}`;
    if (choice.mode === 'off') return '已关闭';
    if (choice.mode === 'random') return `随机${choice.name ? ` · ${choice.name}` : ''}`;
    return choice.name ?? '未设置';
  };

  const stylePreview = (kind: ChunithmBestImageStyleKind) => {
    if (stylePrefs[kind].mode === 'off') {
      return <Text style={[styles.noAsset, { color: theme.textMuted }]}>已关闭</Text>;
    }
    const dataUri = kind === 'character'
      ? characterDataUri
      : kind === 'plate'
        ? plateDataUri
        : trophyDataUri;
    if (dataUri) {
      return (
        <Image
          source={{ uri: dataUri }}
          style={
            kind === 'character'
              ? styles.characterPreview
              : kind === 'plate'
                ? styles.platePreview
                : styles.trophyPreview
          }
          resizeMode={kind === 'character' ? 'cover' : 'contain'}
        />
      );
    }
    return <Text style={[styles.noAsset, { color: theme.textMuted }]}>未设置</Text>;
  };

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
    if (!payload || !webViewSources || !htmlPages || exportStatus) return;
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
            'best50',
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
          <View
            accessibilityLabel="Best50"
            accessibilityRole="tab"
            accessibilityState={{ selected: true }}
            style={[styles.segment, { backgroundColor: theme.surface }]}
          >
            <Text style={[styles.segmentText, { color: theme.accent }]}>Best50</Text>
          </View>
        </View>

        <Text style={[styles.label, styles.sectionLabel, { color: theme.text }]}>样式选择</Text>
        <View style={[styles.styleList, { backgroundColor: theme.surface }]}>
          <View style={[styles.overflowStyleRow, { borderBottomColor: theme.border }]}>
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
          </View>
          {CHUNITHM_BEST_IMAGE_STYLE_KINDS.map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={`选择${STYLE_LABELS[kind]}`}
              onPress={() => setPicker(kind)}
              style={({ pressed }) => [
                styles.styleRow,
                { borderBottomColor: theme.border },
                pressed && { backgroundColor: theme.surfaceMuted },
              ]}
            >
              <View style={styles.stylePreview}>{stylePreview(kind)}</View>
              <View style={styles.styleCopy}>
                <Text style={[styles.styleName, { color: theme.text }]}>{STYLE_LABELS[kind]}</Text>
                <Text numberOfLines={1} style={[styles.styleValue, { color: theme.textMuted }]}>
                  {styleValue(kind)}
                </Text>
              </View>
              <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
            </Pressable>
          ))}
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
          {width} × {outputHeight} px · 每页最多 {50 + stylePrefs.selectionCount} 张 · 第 {pageIndex + 1}/{pages.length} 页
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
          disabled={!sources || !!exportStatus}
          onPress={() => void exportImages()}
          style={[
            styles.exportButton,
            { backgroundColor: theme.accent },
            (!sources || !!exportStatus) && styles.exportButtonDisabled,
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
        visible={picker !== null}
        kind={picker}
        items={picker ? collections?.[picker] ?? [] : []}
        selection={picker ? stylePrefs[picker] : null}
        onClose={() => setPicker(null)}
        onSelect={chooseStyle}
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
  platePreview: { width: 132, height: 46, borderRadius: 8 },
  trophyPreview: { width: 132, height: 36, borderRadius: 8 },
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

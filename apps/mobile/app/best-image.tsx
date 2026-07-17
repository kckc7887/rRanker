import { useEffect, useMemo, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { useGameData } from '@/hooks/use-game-data';
import { CollectionImage } from '@/components/CollectionImage';
import type { Player } from '@/domain/models';
import {
  buildBestImageHtml,
  minimumBestImageHeight,
  parseBestImageHeightMessage,
  parseBestImageReadyMessage,
  ratingFrameIndex,
  type BestImageScoreSection,
  type BestImageType,
} from '@/features/best-image/build-best-image-html';
import {
  buildCustomBestImageSections,
  DEFAULT_CUSTOM_BEST_IMAGE_FILTERS,
  FC_ACHIEVEMENTS,
  FS_ACHIEVEMENTS,
  maximumBestImageRowsForWidth,
  paginateBestImageSections,
  parseBestImageMinimumAchievement,
  parseBestImageQuantity,
  type BestImageAchievementFilter,
  type BestImageVersionFilter,
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
  type BestImageStyleSelections,
} from '@/features/best-image/best-image-style-preferences';
import { useBestImageCollections } from '@/features/best-image/use-best-image-collections';
import { loadBestImageJackets } from '@/features/best-image/load-best-image-jackets';
import {
  bestImageCaptureDimensions,
  bestImageExportFilename,
  deleteBestImageCapture,
  isDrawViewHierarchyError,
  requestBestImageExportPermission,
  saveBestImageCapture,
  shouldUseBestImageRenderInContext,
} from '@/features/best-image/best-image-export';

const IMAGE_TYPES: { id: BestImageType; label: string }[] = [
  { id: 'best50', label: 'Best50' },
  { id: 'custom', label: '自定义' },
];
const OUTPUT_WIDTHS = [1080, 1440, 2160] as const;
const STYLE_ITEMS: { kind: BestImageCollectionKind; label: string }[] = [
  { kind: 'icon', label: '头像' },
  { kind: 'plate', label: '姓名框' },
  { kind: 'trophy', label: '称号' },
  { kind: 'frame', label: '背景' },
];
const FALLBACK_PLAYER: Pick<Player, 'displayName' | 'presentation'> = {
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

function ChoiceChip({ label, selected, disabled = false, onPress, accessibilityLabel }: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return <Pressable
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityRole="button"
    accessibilityState={{ disabled, selected }}
    disabled={disabled}
    onPress={onPress}
    style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
  >
    <Text style={[styles.chipText, selected && styles.chipTextSelected, disabled && styles.chipTextDisabled]}>{label}</Text>
  </Pressable>;
}

function StylePreview({
  kind,
  selection,
  player,
}: {
  kind: BestImageCollectionKind;
  selection?: AppliedBestImageStyleSelection;
  player: Pick<Player, 'displayName' | 'presentation'>;
}) {
  if (selection?.mode === 'off') return <Text style={styles.noAsset}>已关闭</Text>;
  const selectedItem = selection?.mode === 'item' || selection?.mode === 'random' ? selection.item : undefined;
  if (kind === 'trophy') {
    return <TrophyPreview item={selectedItem} fallback={player.presentation?.trophyName} />;
  }
  const collectionId = selectedItem?.id ?? ({
    icon: player.presentation?.iconId,
    plate: player.presentation?.namePlateId,
    frame: player.presentation?.frameId,
  } as const)[kind];
  if (collectionId === undefined) return <Text style={styles.noAsset}>未设置</Text>;
  return <CollectionImage kind={kind} collectionId={collectionId} size={kind === 'plate' ? 18 : 44} borderRadius={kind === 'plate' ? 4 : 10} />;
}

export default function BestImageScreen() {
  const { data, activeAccountId } = useGameData();
  const window = useWindowDimensions();
  const [imageType, setImageType] = useState<BestImageType>('best50');
  const [outputWidth, setOutputWidth] = useState(1080);
  const [pageHeights, setPageHeights] = useState<Record<string, number>>({});
  const [embeddedAssets, setEmbeddedAssets] = useState<BestImageEmbeddedAssets | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [coverUrls, setCoverUrls] = useState<Record<string, string | null> | null>(null);
  const [coverProgress, setCoverProgress] = useState({ completed: 0, total: 0 });
  const [activePicker, setActivePicker] = useState<BestImageCollectionKind | null>(null);
  const [styleSelections, setStyleSelections] = useState<BestImageStyleSelections>({});
  const [stylePreferencesReady, setStylePreferencesReady] = useState(false);
  const [quantityText, setQuantityText] = useState(String(DEFAULT_CUSTOM_BEST_IMAGE_FILTERS.quantity));
  const [quantity, setQuantity] = useState(DEFAULT_CUSTOM_BEST_IMAGE_FILTERS.quantity);
  const [minimumAchievementText, setMinimumAchievementText] = useState(String(DEFAULT_CUSTOM_BEST_IMAGE_FILTERS.minimumAchievement));
  const [minimumAchievement, setMinimumAchievement] = useState(DEFAULT_CUSTOM_BEST_IMAGE_FILTERS.minimumAchievement);
  const [versions, setVersions] = useState<BestImageVersionFilter[]>([...DEFAULT_CUSTOM_BEST_IMAGE_FILTERS.versions]);
  const [splitVersions, setSplitVersions] = useState(false);
  const [achievement, setAchievement] = useState<BestImageAchievementFilter>(null);
  const [strictAchievement, setStrictAchievement] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [exportPageIndex, setExportPageIndex] = useState<number | null>(null);
  const [exportHeight, setExportHeight] = useState(minimumBestImageHeight(1080));
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const exportCaptureRef = useRef<View>(null);
  const exportReadyResolver = useRef<((height: number) => void) | null>(null);
  const exportReadyRejecter = useRef<((error: Error) => void) | null>(null);
  const exportTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const randomizedSelections = useRef(new Set<string>());
  const collections = useBestImageCollections();
  const maimai = data?.payload.kind === 'maimai' ? data.payload : null;
  const player = maimai?.player;
  const basePlayer = player ?? FALLBACK_PLAYER;
  const rating = maimai?.playerScore.value ?? 0;
  const frameSource = RATING_FRAME_SOURCES[ratingFrameIndex(rating)]!;

  useEffect(() => {
    let cancelled = false;
    setEmbeddedAssets(null);
    setAssetError(null);
    loadBestImageAssets(FONT_SOURCE, frameSource).then(
      (assets) => { if (!cancelled) setEmbeddedAssets(assets); },
      () => { if (!cancelled) setAssetError('字体或 Rating 框加载失败'); },
    );
    return () => { cancelled = true; };
  }, [frameSource]);

  useEffect(() => {
    let cancelled = false;
    setStylePreferencesReady(false);
    randomizedSelections.current.clear();
    bestImageStylePreferencesStore.load(activeAccountId).then((preferences) => {
      if (cancelled) return;
      setStyleSelections(preferences.selections);
      setStylePreferencesReady(true);
    });
    return () => { cancelled = true; };
  }, [activeAccountId]);

  useEffect(() => {
    if (!stylePreferencesReady) return;
    void bestImageStylePreferencesStore.save(activeAccountId, styleSelections).catch(() => undefined);
  }, [activeAccountId, stylePreferencesReady, styleSelections]);

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
    setStyleSelections((current) => {
      const next = { ...current };
      let changed = false;
      for (const { kind } of STYLE_ITEMS) {
        const selection = current[kind];
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
      return changed ? next : current;
    });
  }, [activeAccountId, collections.data?.items, stylePreferencesReady, styleSelections]);

  const previewPlayer = useMemo(() => ({
    displayName: basePlayer.displayName,
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
  const minimumAchievementError = parseBestImageMinimumAchievement(minimumAchievementText) === null ? '最小达成率必须在 0–101 之间' : null;
  const customInputValid = !quantityError && !minimumAchievementError && versions.length > 0;

  const customSections = useMemo(() => buildCustomBestImageSections(
    maimai?.records ?? [],
    maimai?.currentVersionTitle ?? '',
    {
      quantity,
      versions,
      splitVersions,
      minimumAchievement,
      achievement,
      strictAchievement,
    },
  ), [achievement, maimai?.currentVersionTitle, maimai?.records, minimumAchievement, quantity, splitVersions, strictAchievement, versions]);
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
  }, [imageType, pageStructureKey]);

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
    pageIndex: page.pageIndex,
    pageCount: page.pageCount,
    ...embeddedAssets,
  })) : null, [coverUrls, embeddedAssets, hiddenStyles, imageType, outputWidth, pages, previewPlayer, rating]);
  const screenWidth = window.width > 0 ? window.width : 390;
  const previewWidth = Math.min(720, Math.max(280, screenWidth - 32));
  const previewHeight = previewWidth * 4 / 3;
  const currentPage = pages[Math.min(currentPageIndex, pages.length - 1)]!;
  const outputHeight = pageHeights[currentPage.id] ?? minimumBestImageHeight(outputWidth);
  const exportBusy = exportPageIndex !== null || exportStatus !== null;
  const formValid = imageType !== 'custom' || customInputValid;

  const chooseWidth = (nextWidth: number) => {
    setOutputWidth(nextWidth);
    setPageHeights({});
  };

  const toggleVersion = (version: BestImageVersionFilter) => {
    const next = versions.includes(version)
      ? versions.filter((item) => item !== version)
      : [...versions, version];
    if (next.length === 0) return;
    setVersions(next);
    if (next.length < 2) setSplitVersions(false);
  };

  const selectCollection = (choice: BestImageCollectionChoice) => {
    if (!activePicker) return;
    if (choice.mode === 'random') randomizedSelections.current.add(`${activeAccountId ?? 'local-preview'}:${activePicker}`);
    setStyleSelections((current) => {
      const next = { ...current };
      if (choice.mode === 'current') delete next[activePicker];
      else next[activePicker] = choice;
      return next;
    });
    setActivePicker(null);
  };

  const waitForExportPage = (pageIndex: number): Promise<number> => new Promise((resolve, reject) => {
    if (exportTimeout.current) clearTimeout(exportTimeout.current);
    exportReadyResolver.current = resolve;
    exportReadyRejecter.current = reject;
    setExportHeight(minimumBestImageHeight(outputWidth));
    setExportPageIndex(pageIndex);
    exportTimeout.current = setTimeout(() => {
      exportReadyResolver.current = null;
      exportReadyRejecter.current = null;
      reject(new Error('图片渲染超时'));
    }, 30_000);
  });

  const handleExportMessage = (dataValue: string) => {
    const measured = parseBestImageHeightMessage(dataValue, outputWidth);
    if (measured !== null) setExportHeight(measured);
    const readyHeight = parseBestImageReadyMessage(dataValue, outputWidth);
    if (readyHeight === null || !exportReadyResolver.current) return;
    setExportHeight(readyHeight);
    const resolve = exportReadyResolver.current;
    exportReadyResolver.current = null;
    exportReadyRejecter.current = null;
    if (exportTimeout.current) clearTimeout(exportTimeout.current);
    exportTimeout.current = null;
    setTimeout(() => resolve(readyHeight), 150);
  };

  const exportImages = async () => {
    if (!htmlPages || !formValid || exportBusy) return;
    const captures: { uri: string; filename: string }[] = [];
    try {
      await requestBestImageExportPermission();
      for (let index = 0; index < htmlPages.length; index += 1) {
        setExportStatus(`正在导出 ${index + 1}/${htmlPages.length}`);
        let uri: string;
        try {
          const height = await waitForExportPage(index);
          const dimensions = bestImageCaptureDimensions(outputWidth, height, PixelRatio.get(), Platform.OS);
          const useRenderInContext = shouldUseBestImageRenderInContext(Platform.OS, outputWidth, height);
          const captureOptions = {
            format: 'png',
            quality: 1,
            result: 'tmpfile',
            ...dimensions,
            ...(useRenderInContext ? { useRenderInContext: true } : {}),
          } as const;
          try {
            uri = await captureRef(exportCaptureRef, captureOptions);
          } catch (error) {
            if (Platform.OS !== 'ios' || useRenderInContext || !isDrawViewHierarchyError(error)) throw error;
            uri = await captureRef(exportCaptureRef, { ...captureOptions, useRenderInContext: true });
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : '未知错误';
          throw new Error(`第 ${index + 1}/${htmlPages.length} 页渲染失败：${reason}`);
        }
        captures.push({
          uri,
          filename: bestImageExportFilename(basePlayer.displayName, imageType, index, htmlPages.length),
        });
      }
      setExportPageIndex(null);
      for (let index = 0; index < captures.length; index += 1) {
        setExportStatus(`正在保存 ${index + 1}/${captures.length}`);
        try {
          await saveBestImageCapture(captures[index]!.uri, captures[index]!.filename);
        } catch (error) {
          const reason = error instanceof Error ? error.message : '未知错误';
          throw new Error(`第 ${index + 1}/${captures.length} 页保存失败：${reason}`);
        }
      }
      Alert.alert('导出完成', `已保存 ${captures.length} 张成绩图片到相册`);
    } catch (error) {
      Alert.alert('导出失败', error instanceof Error ? error.message : '无法导出成绩图片');
    } finally {
      if (exportTimeout.current) clearTimeout(exportTimeout.current);
      exportTimeout.current = null;
      exportReadyResolver.current = null;
      exportReadyRejecter.current = null;
      setExportPageIndex(null);
      setExportStatus(null);
      captures.forEach((capture) => deleteBestImageCapture(capture.uri));
    }
  };

  return <>
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>选择类型</Text>
      <View accessibilityRole="tablist" style={styles.segmentedControl}>
        {IMAGE_TYPES.map((item) => {
          const selected = imageType === item.id;
          return <Pressable key={item.id} accessibilityLabel={item.label} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setImageType(item.id)} style={[styles.segment, selected && styles.segmentSelected]}>
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{item.label}</Text>
          </Pressable>;
        })}
      </View>

      {imageType === 'custom' ? <View style={styles.customPanel}>
        <Text style={styles.panelTitle}>自定义 BestN</Text>
        <View style={styles.fieldRow}>
          <View style={styles.textFieldWrap}>
            <Text style={styles.fieldLabel}>数量</Text>
            <TextInput accessibilityLabel="自定义数量" autoCorrect={false} value={quantityText} onChangeText={(value) => {
              setQuantityText(value);
              const parsed = parseBestImageQuantity(value);
              if (parsed !== null) setQuantity(parsed);
            }} placeholder="0 为无限制" style={[styles.textInput, quantityError && styles.textInputError]} />
            {quantityError ? <Text style={styles.errorText}>{quantityError}</Text> : null}
          </View>
          <View style={styles.textFieldWrap}>
            <Text style={styles.fieldLabel}>最小达成率</Text>
            <TextInput accessibilityLabel="最小达成率" autoCorrect={false} value={minimumAchievementText} onChangeText={(value) => {
              setMinimumAchievementText(value);
              const parsed = parseBestImageMinimumAchievement(value);
              if (parsed !== null) setMinimumAchievement(parsed);
            }} placeholder="0–101" style={[styles.textInput, minimumAchievementError && styles.textInputError]} />
            {minimumAchievementError ? <Text style={styles.errorText}>{minimumAchievementError}</Text> : null}
          </View>
        </View>
        <Text style={styles.fieldLabel}>版本</Text>
        <View style={styles.chipRow}>
          <ChoiceChip label="当前版本" selected={versions.includes('current')} onPress={() => toggleVersion('current')} />
          <ChoiceChip label="过往版本" selected={versions.includes('past')} onPress={() => toggleVersion('past')} />
          <ChoiceChip accessibilityLabel="区分版本" label="区分版本" disabled={versions.length < 2} selected={splitVersions} onPress={() => setSplitVersions((value) => !value)} />
        </View>
        <Text style={styles.fieldLabel}>成就</Text>
        <View style={styles.chipRow}>
          <ChoiceChip label="不限" selected={achievement === null} onPress={() => { setAchievement(null); setStrictAchievement(false); }} />
          {FC_ACHIEVEMENTS.map((item) => <ChoiceChip key={item.value} label={item.label} selected={achievement?.family === 'fc' && achievement.value === item.value} onPress={() => setAchievement({ family: 'fc', value: item.value })} />)}
        </View>
        <View style={styles.chipRow}>
          {FS_ACHIEVEMENTS.map((item) => <ChoiceChip key={item.value} label={item.label} selected={achievement?.family === 'fs' && achievement.value === item.value} onPress={() => setAchievement({ family: 'fs', value: item.value })} />)}
        </View>
        <ChoiceChip accessibilityLabel="严格筛选" label="严格筛选" disabled={achievement === null} selected={strictAchievement} onPress={() => setStrictAchievement((value) => !value)} />
      </View> : null}

      <Text style={[styles.label, styles.sectionLabel]}>样式选择</Text>
      <View style={styles.styleList}>
        {STYLE_ITEMS.map(({ kind, label }) => {
          const selection = styleSelections[kind];
          const selectedItem = selection?.mode === 'item' || selection?.mode === 'random' ? selection.item : undefined;
          const fallbackName = kind === 'trophy' ? basePlayer.presentation?.trophyName : `玩家当前${label}`;
          const selectionName = selection?.mode === 'off' ? '已关闭' : selection?.mode === 'random' ? `随机 · ${selection.item.name}` : selectedItem?.name ?? fallbackName ?? '未设置';
          return <Pressable key={kind} accessibilityLabel={`选择${label}`} accessibilityRole="button" onPress={() => setActivePicker(kind)} style={({ pressed }) => [styles.styleRow, pressed && styles.styleRowPressed]}>
            <View style={styles.stylePreview}><StylePreview kind={kind} selection={selection} player={basePlayer} /></View>
            <View style={styles.styleCopy}><Text style={styles.styleName}>{label}</Text><Text numberOfLines={1} style={styles.styleValue}>{selectionName}</Text></View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>;
        })}
      </View>

      <Text style={[styles.label, styles.sectionLabel]}>分辨率</Text>
      <View style={styles.widthOptions}>
        {OUTPUT_WIDTHS.map((width) => {
          const selected = outputWidth === width;
          return <Pressable key={width} accessibilityLabel={`宽度 ${width} 像素`} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => chooseWidth(width)} style={[styles.widthOption, selected && styles.widthOptionSelected]}>
            <Text style={[styles.widthOptionText, selected && styles.widthOptionTextSelected]}>{width}px</Text>
          </Pressable>;
        })}
      </View>
      <Text style={styles.dimensionMeta}>{outputWidth} × {outputHeight} px · 每页最多 {maximumRowsPerPage} 行 · 第 {currentPageIndex + 1}/{pages.length} 页</Text>

      <Text style={[styles.label, styles.sectionLabel]}>预览</Text>
      <View accessibilityLabel="HTML图片预览窗" style={[styles.previewFrame, { width: previewWidth, height: previewHeight }]}>
        {htmlPages ? <FlatList
          data={htmlPages}
          horizontal
          initialNumToRender={2}
          keyExtractor={(_, index) => pages[index]!.id}
          maxToRenderPerBatch={3}
          onMomentumScrollEnd={(event) => setCurrentPageIndex(Math.round(event.nativeEvent.contentOffset.x / previewWidth))}
          pagingEnabled
          renderItem={({ item: html, index }) => <View style={{ width: previewWidth, height: previewHeight }}>
            <WebView accessibilityLabel={`HTML图片预览 第${index + 1}页`} bounces={false} javaScriptEnabled mixedContentMode="never" originWhitelist={['*']} onMessage={(event) => {
              const measuredHeight = parseBestImageHeightMessage(event.nativeEvent.data, outputWidth);
              if (measuredHeight !== null) setPageHeights((current) => ({ ...current, [pages[index]!.id]: measuredHeight }));
            }} scrollEnabled={false} source={{ html, baseUrl: 'https://assets2.lxns.net/' }} style={styles.webview} testID={`best-image-html-preview-${index}`} />
          </View>}
          showsHorizontalScrollIndicator={false}
          removeClippedSubviews={false}
          style={styles.previewPager}
          windowSize={3}
        /> : <View style={styles.loadingPreview}>
          {assetError ? <Text accessibilityRole="alert" style={styles.assetError}>{assetError}</Text> : <View style={styles.loadingContent}>
            <ActivityIndicator accessibilityLabel="正在加载预览素材" color="#246BFD" size="large" />
            <Text style={styles.loadingText}>{coverProgress.total > 0 && coverUrls === null ? `正在逐张缓存歌曲封面 ${coverProgress.completed}/${coverProgress.total}` : '正在加载预览素材'}</Text>
          </View>}
        </View>}
      </View>
      {pages.length > 1 ? <View style={styles.pageDots}>{pages.map((page, index) => <View key={page.id} style={[styles.pageDot, index === currentPageIndex && styles.pageDotActive]} />)}</View> : null}
      <Pressable accessibilityLabel="导出成绩图片" accessibilityRole="button" disabled={!htmlPages || !formValid || exportBusy} onPress={() => void exportImages()} style={[styles.exportButton, (!htmlPages || !formValid || exportBusy) && styles.exportButtonDisabled]}>
        {exportBusy ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
        <Text style={styles.exportButtonText}>{exportStatus ?? '导出到相册'}</Text>
      </Pressable>
    </ScrollView>

    <BestImageCollectionPicker visible={activePicker !== null} kind={activePicker} items={collections.data?.items ?? []} selectedId={activePicker && (styleSelections[activePicker]?.mode === 'item' || styleSelections[activePicker]?.mode === 'random') ? styleSelections[activePicker].item.id : null} selectedMode={activePicker ? styleSelections[activePicker]?.mode ?? 'current' : 'current'} isLoading={collections.isLoading} isError={collections.isError} onRetry={() => { void collections.refetch(); }} onClose={() => setActivePicker(null)} onSelect={selectCollection} />

    <Modal visible={exportPageIndex !== null} animationType="none" transparent={false} onRequestClose={() => exportReadyRejecter.current?.(new Error('导出已取消'))}>
      {exportPageIndex !== null && htmlPages?.[exportPageIndex] ? <View style={styles.exportRoot}>
        <View ref={exportCaptureRef} collapsable={false} style={{ width: outputWidth / PixelRatio.get(), height: exportHeight / PixelRatio.get(), backgroundColor: '#E7EDF5' }}>
          <WebView key={`export-${exportPageIndex}-${outputWidth}`} accessibilityLabel={`导出渲染 第${exportPageIndex + 1}页`} androidLayerType="software" bounces={false} javaScriptEnabled mixedContentMode="never" originWhitelist={['*']} onMessage={(event) => handleExportMessage(event.nativeEvent.data)} scrollEnabled={false} source={{ html: htmlPages[exportPageIndex], baseUrl: 'https://assets2.lxns.net/' }} style={styles.webview} />
        </View>
        <View style={styles.exportOverlay}><ActivityIndicator color="#246BFD" size="large" /><Text style={styles.exportOverlayText}>{exportStatus ?? '正在准备导出'}</Text></View>
      </View> : null}
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 16, paddingBottom: 32, alignItems: 'stretch' },
  label: { color: '#111827', fontSize: 15, fontWeight: '800', marginBottom: 10 },
  sectionLabel: { marginTop: 24 },
  segmentedControl: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: '#E8EBF0' },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  segmentSelected: { backgroundColor: '#FFFFFF' },
  segmentText: { color: '#6B7280', fontSize: 14, fontWeight: '700' },
  segmentTextSelected: { color: '#246BFD' },
  customPanel: { marginTop: 16, padding: 14, gap: 10, borderRadius: 16, backgroundColor: '#FFFFFF' },
  panelTitle: { color: '#111827', fontSize: 15, fontWeight: '800' },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  textFieldWrap: { flex: 1, minWidth: 0 },
  fieldLabel: { color: '#596579', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  textInput: { minHeight: 40, paddingHorizontal: 11, borderWidth: 1, borderColor: '#D8DDE6', borderRadius: 10, backgroundColor: '#F8FAFC', color: '#111827', fontSize: 14 },
  textInputError: { borderColor: '#D92D20' },
  errorText: { marginTop: 4, color: '#D92D20', fontSize: 10, lineHeight: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minWidth: 46, height: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: '#D8DDE6', borderRadius: 999, backgroundColor: '#FFFFFF' },
  chipSelected: { borderColor: '#246BFD', backgroundColor: '#EEF4FF' },
  chipDisabled: { opacity: 0.42 },
  chipText: { color: '#596579', fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center', includeFontPadding: false },
  chipTextSelected: { color: '#246BFD' },
  chipTextDisabled: { color: '#9CA3AF' },
  styleList: { overflow: 'hidden', borderRadius: 16, backgroundColor: '#FFFFFF' },
  styleRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  styleRowPressed: { backgroundColor: '#F3F6FA' },
  stylePreview: { width: 132, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  styleCopy: { flex: 1, minWidth: 0 },
  styleName: { color: '#111827', fontSize: 14, fontWeight: '800' },
  styleValue: { color: '#8A93A3', fontSize: 12, marginTop: 3 },
  chevron: { color: '#9CA3AF', fontSize: 26, fontWeight: '300' },
  noAsset: { color: '#9CA3AF', fontSize: 12 },
  widthOptions: { flexDirection: 'row', gap: 8 },
  widthOption: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#D6DAE1', backgroundColor: '#FFFFFF' },
  widthOptionSelected: { borderColor: '#246BFD', backgroundColor: '#EEF4FF' },
  widthOptionText: { color: '#6B7280', fontSize: 13, fontWeight: '700' },
  widthOptionTextSelected: { color: '#246BFD' },
  dimensionMeta: { color: '#8A93A3', fontSize: 12, marginTop: 8, textAlign: 'right' },
  previewFrame: { alignSelf: 'center', overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: '#DDE1E8', backgroundColor: '#FFFFFF' },
  previewPager: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
  loadingPreview: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingContent: { alignItems: 'center', gap: 10 },
  loadingText: { color: '#687386', fontSize: 12, fontWeight: '600' },
  assetError: { color: '#B42318', fontSize: 14, fontWeight: '700' },
  pageDots: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  pageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#CDD3DD' },
  pageDotActive: { width: 18, backgroundColor: '#246BFD' },
  exportButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 14, borderRadius: 14, backgroundColor: '#246BFD' },
  exportButtonDisabled: { backgroundColor: '#AAB8D0' },
  exportButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  exportRoot: { flex: 1, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  exportOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F7F8FA' },
  exportOverlayText: { color: '#4B5563', fontSize: 14, fontWeight: '700' },
});

import { useEffect, useMemo, useState } from 'react';
import { WebView } from 'react-native-webview';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useGameData } from '@/hooks/use-game-data';
import { CollectionImage } from '@/components/CollectionImage';
import type { CollectionItem, Player } from '@/domain/models';
import {
  buildBestImageHtml,
  minimumBestImageHeight,
  parseBestImageHeightMessage,
  ratingFrameIndex,
  type BestImageType,
} from '@/features/best-image/build-best-image-html';
import {
  loadBestImageAssets,
  type BestImageEmbeddedAssets,
} from '@/features/best-image/load-best-image-assets';
import {
  BestImageCollectionPicker,
  TrophyPreview,
  type BestImageCollectionKind,
} from '@/features/best-image/best-image-collection-picker';
import { useBestImageCollections } from '@/features/best-image/use-best-image-collections';

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

function StylePreview({
  kind,
  selection,
  player,
}: {
  kind: BestImageCollectionKind;
  selection?: CollectionItem;
  player: Pick<Player, 'displayName' | 'presentation'>;
}) {
  if (kind === 'trophy') {
    return <TrophyPreview item={selection} fallback={player.presentation?.trophyName} />;
  }
  const collectionId = selection?.id ?? ({
    icon: player.presentation?.iconId,
    plate: player.presentation?.namePlateId,
    frame: player.presentation?.frameId,
  } as const)[kind];
  if (collectionId === undefined) return <Text style={styles.noAsset}>未设置</Text>;
  return (
    <CollectionImage
      kind={kind}
      collectionId={collectionId}
      size={kind === 'plate' ? 18 : 44}
      borderRadius={kind === 'plate' ? 4 : 10}
    />
  );
}

export default function BestImageScreen() {
  const { data } = useGameData();
  const window = useWindowDimensions();
  const [imageType, setImageType] = useState<BestImageType>('best50');
  const [outputWidth, setOutputWidth] = useState(1080);
  const [outputHeight, setOutputHeight] = useState(minimumBestImageHeight(1080));
  const [embeddedAssets, setEmbeddedAssets] = useState<BestImageEmbeddedAssets | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<BestImageCollectionKind | null>(null);
  const [styleSelections, setStyleSelections] = useState<Partial<Record<BestImageCollectionKind, CollectionItem>>>({});
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
  const previewPlayer = useMemo(() => ({
    displayName: basePlayer.displayName,
    presentation: {
      ...basePlayer.presentation,
      iconId: styleSelections.icon?.id ?? basePlayer.presentation?.iconId,
      namePlateId: styleSelections.plate?.id ?? basePlayer.presentation?.namePlateId,
      frameId: styleSelections.frame?.id ?? basePlayer.presentation?.frameId,
      trophyName: styleSelections.trophy?.name ?? basePlayer.presentation?.trophyName,
      trophyColor: styleSelections.trophy?.color ?? basePlayer.presentation?.trophyColor,
    },
  }), [basePlayer, styleSelections]);
  const html = useMemo(() => embeddedAssets ? buildBestImageHtml({
    type: imageType,
    width: outputWidth,
    player: previewPlayer,
    rating,
    ...embeddedAssets,
  }) : null, [embeddedAssets, imageType, outputWidth, previewPlayer, rating]);
  const screenWidth = window.width > 0 ? window.width : 390;
  const previewWidth = Math.min(720, Math.max(280, screenWidth - 32));
  const previewHeight = previewWidth * 4 / 3;

  const chooseWidth = (nextWidth: number) => {
    setOutputWidth(nextWidth);
    setOutputHeight(minimumBestImageHeight(nextWidth));
  };

  const selectCollection = (item: CollectionItem | null) => {
    if (!activePicker) return;
    setStyleSelections((current) => {
      const next = { ...current };
      if (item) next[activePicker] = item;
      else delete next[activePicker];
      return next;
    });
    setActivePicker(null);
  };

  return <>
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>选择类型</Text>
      <View accessibilityRole="tablist" style={styles.segmentedControl}>
        {IMAGE_TYPES.map((item) => {
          const selected = imageType === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityLabel={item.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setImageType(item.id)}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, styles.sectionLabel]}>样式选择</Text>
      <View style={styles.styleList}>
        {STYLE_ITEMS.map(({ kind, label }) => {
          const selection = styleSelections[kind];
          const fallbackName = kind === 'trophy'
            ? basePlayer.presentation?.trophyName
            : `玩家当前${label}`;
          return (
            <Pressable
              key={kind}
              accessibilityLabel={`选择${label}`}
              accessibilityRole="button"
              onPress={() => setActivePicker(kind)}
              style={({ pressed }) => [styles.styleRow, pressed && styles.styleRowPressed]}
            >
              <View style={styles.stylePreview}>
                <StylePreview kind={kind} selection={selection} player={basePlayer} />
              </View>
              <View style={styles.styleCopy}>
                <Text style={styles.styleName}>{label}</Text>
                <Text numberOfLines={1} style={styles.styleValue}>{selection?.name ?? fallbackName ?? '未设置'}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, styles.sectionLabel]}>分辨率</Text>
      <View style={styles.widthOptions}>
        {OUTPUT_WIDTHS.map((width) => {
          const selected = outputWidth === width;
          return (
            <Pressable
              key={width}
              accessibilityLabel={`宽度 ${width} 像素`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => chooseWidth(width)}
              style={[styles.widthOption, selected && styles.widthOptionSelected]}
            >
              <Text style={[styles.widthOptionText, selected && styles.widthOptionTextSelected]}>{width}px</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.dimensionMeta}>{outputWidth} × {outputHeight} px · 高度随内容自动增长</Text>

      <Text style={[styles.label, styles.sectionLabel]}>预览</Text>
      <View
        accessibilityLabel="HTML图片预览窗"
        style={[styles.previewFrame, { width: previewWidth, height: previewHeight }]}
      >
        {html ? <WebView
          accessibilityLabel="HTML图片预览"
          bounces={false}
          javaScriptEnabled
          mixedContentMode="never"
          originWhitelist={['*']}
          onMessage={(event) => {
            const measuredHeight = parseBestImageHeightMessage(event.nativeEvent.data, outputWidth);
            if (measuredHeight !== null) setOutputHeight(measuredHeight);
          }}
          scrollEnabled={false}
          source={{ html, baseUrl: 'https://assets2.lxns.net/' }}
          style={styles.webview}
          testID="best-image-html-preview"
        /> : <View style={styles.loadingPreview}>
          {assetError
            ? <Text accessibilityRole="alert" style={styles.assetError}>{assetError}</Text>
            : <ActivityIndicator accessibilityLabel="正在加载预览素材" color="#246BFD" size="large" />}
        </View>}
      </View>
    </ScrollView>
    <BestImageCollectionPicker
      visible={activePicker !== null}
      kind={activePicker}
      items={collections.data?.items ?? []}
      selectedId={activePicker ? styleSelections[activePicker]?.id ?? null : null}
      isLoading={collections.isLoading}
      isError={collections.isError}
      onRetry={() => { void collections.refetch(); }}
      onClose={() => setActivePicker(null)}
      onSelect={selectCollection}
    />
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
  webview: { flex: 1, backgroundColor: 'transparent' },
  loadingPreview: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  assetError: { color: '#B42318', fontSize: 14, fontWeight: '700' },
});

import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Modal,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useAppTheme } from '@/theme/app-theme';
import type { BestImageWebViewSource } from './prepare-best-image-webview-sources';
import {
  markBestImageWebViewLoaded,
  updateBestImageWebViewState,
} from './best-image-webview-state';
import type {
  BestImagePreviewStatesSetter,
  BestImageCaptureRef,
} from './use-best-image-screen-controller';

/**
 * best-image 三屏（舞萌/中二/Phigros）共用的屏幕骨架。
 *
 * 只承载三屏渲染结构 1:1 同构的部分：ScrollView 外壳 → 类型分段 → 自定义面板外壳 →
 * 样式选择列表容器 → 分辨率行 → 预览轮播（FlatList + WebView 三种消息 → pageDots）→
 * 导出按钮 + 状态行 → 导出遮罩 Modal。
 *
 * 结构与样式值经参数/插槽表达，不枚举游戏 ID：
 * - 三屏有差异的样式键（exportRoot 背景色等）由各屏覆盖注入；
 * - 自定义面板内容、样式列表头/行、加载占位、素材状态条、picker 均为插槽；
 * - 预览/导出 WebView 的文件访问参数与 testID 前缀为参数。
 */

export type BestImageScreenShellStyles = {
  page: ViewStyle;
  content: ViewStyle;
  label: TextStyle;
  sectionLabel: TextStyle;
  segmentedControl: ViewStyle;
  segment: ViewStyle;
  segmentText: TextStyle;
  customPanel: ViewStyle;
  panelTitle: TextStyle;
  styleList: ViewStyle;
  /** 样式选择行（各屏插槽渲染，样式值三屏同构）。 */
  styleRow: ViewStyle;
  stylePreview: ViewStyle;
  styleCopy: ViewStyle;
  styleName: TextStyle;
  styleValue: TextStyle;
  chevron: TextStyle;
  noAsset: TextStyle;
  widthOptions: ViewStyle;
  widthOption: ViewStyle;
  widthOptionText: TextStyle;
  dimensionMeta: TextStyle;
  previewFrame: ViewStyle;
  previewPager: ViewStyle;
  webview: ViewStyle;
  loadingPreview: ViewStyle;
  pageDots: ViewStyle;
  pageDot: ViewStyle;
  exportButton: ViewStyle;
  exportButtonDisabled: ViewStyle;
  exportButtonText: TextStyle;
  exportRoot: ViewStyle;
  exportOverlay: ViewStyle;
  exportOverlayText: TextStyle;
};

/** 共享样式全集：骨架用键 + 各屏自定义面板/样式行共用的键（fieldRow、chip 等）。 */
export type BestImageScreenSharedStyles = BestImageScreenShellStyles & {
  fieldRow: ViewStyle;
  textInput: TextStyle;
  textInputError: TextStyle;
  chip: ViewStyle;
  chipText: TextStyle;
  ratingStyleRow: ViewStyle;
  overflowStyleRow: ViewStyle;
  overflowCopy: ViewStyle;
  overflowChoices: ViewStyle;
  loadingContent: ViewStyle;
  loadingText: TextStyle;
};

/**
 * 三屏逐字同值的共享样式键（含各屏自定义面板/样式行共用的 fieldRow、chip 等）。
 * 差异键（textFieldWrap/fieldLabel/errorText/fontStatus/exportRoot 等）由各屏
 * 自己的 StyleSheet 覆盖，不在此统一。
 */
export const bestImageScreenSharedStyles: BestImageScreenSharedStyles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, alignItems: 'stretch' },
  label: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  sectionLabel: { marginTop: 24 },
  segmentedControl: { flexDirection: 'row', padding: 4, borderRadius: 14 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  segmentText: { fontSize: 14, fontWeight: '700' },
  customPanel: { marginTop: 16, padding: 14, gap: 10, borderRadius: 16 },
  panelTitle: { fontSize: 15, fontWeight: '800' },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  textInput: { minHeight: 40, paddingHorizontal: 11, borderWidth: 1, borderRadius: 10, fontSize: 14 },
  textInputError: { borderColor: '#D92D20' },
  chip: { minWidth: 46, height: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderRadius: 999 },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center', includeFontPadding: false },
  styleList: { overflow: 'hidden', borderRadius: 16 },
  ratingStyleRow: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  overflowStyleRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  overflowCopy: { flex: 1, minWidth: 0 },
  overflowChoices: { flexDirection: 'row', gap: 6 },
  styleRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  stylePreview: { width: 132, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
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
  pageDots: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  pageDot: { width: 6, height: 6, borderRadius: 3 },
  exportButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 14, borderRadius: 14 },
  exportButtonDisabled: { opacity: 0.55 },
  exportButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  exportRoot: { flex: 1, overflow: 'hidden', backgroundColor: '#111111' },
  exportOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12 },
  exportOverlayText: { fontSize: 14, fontWeight: '700' },
});

export type BestImageChoiceChipStyles = {
  chip: ViewStyle;
  chipText: TextStyle;
  chipDisabled?: ViewStyle;
  chipTextDisabled?: TextStyle;
};

export function BestImageChoiceChip({
  label,
  selected,
  disabled = false,
  reportDisabledState = false,
  onPress,
  accessibilityLabel,
  styles,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  reportDisabledState?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  styles: BestImageChoiceChipStyles;
}) {
  const theme = useAppTheme();
  return <Pressable
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityRole="button"
    accessibilityState={reportDisabledState ? { disabled, selected } : { selected }}
    {...(reportDisabledState || disabled ? { disabled } : {})}
    onPress={onPress}
    style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }, selected && { backgroundColor: theme.accentSoft, borderColor: theme.accent }, ...(disabled && styles.chipDisabled ? [styles.chipDisabled] : [])]}
  >
    <Text style={[styles.chipText, { color: theme.textSecondary }, selected && { color: theme.accent }, ...(disabled && styles.chipTextDisabled ? [styles.chipTextDisabled] : [])]}>{label}</Text>
  </Pressable>;
}

export function BestImageScreenShell<TType extends string>({
  imageTypes,
  activeType,
  onSelectType,
  customPanelBody,
  styleListHeader,
  styleRows,
  widths,
  activeWidth,
  onChooseWidth,
  dimensionMeta,
  previewTestIdPrefix,
  sources,
  pages,
  pageIndex,
  onPageIndexChange,
  onPreviewStatesChange,
  onPreviewMessage,
  fileAccessFromFileURLs,
  allowingReadAccessToUrl,
  loadingPreview,
  fontStatus,
  fontStatusAboveDots,
  exportDisabled,
  exportSpinner,
  exportIdleLabel,
  exportStatus,
  onExport,
  exportIndex,
  exportHeight,
  exportSource,
  exportWebViewKeyPrefix,
  captureRef,
  captureAccessibilityLabel,
  captureBackgroundColor,
  onExportMessage,
  onRequestCloseExport,
  pickers,
  styles,
}: {
  /** 类型分段选项（舞萌 Best50 / 中二 Best50 / Phigros Best30 + 各自「自定义」）。 */
  imageTypes: readonly { id: TType; label: string }[];
  activeType: TType;
  onSelectType: (id: TType) => void;
  /** 自定义面板标题之下的游戏筛选表单；null 时整个面板不渲染。 */
  customPanelBody: ReactNode;
  /** 样式列表顶部整块（Rating 风格分段 / Selection·OVER FLOW 追加行等）。 */
  styleListHeader: ReactNode;
  /** 样式选择行（收藏品 / 角色 / 头像背景等）。 */
  styleRows: ReactNode;
  widths: readonly number[];
  activeWidth: number;
  onChooseWidth: (width: number) => void;
  dimensionMeta: ReactNode;
  /** 预览 WebView testID 前缀（best-image / chunithm-best-image / phigros-best-image）。 */
  previewTestIdPrefix: string;
  sources: readonly BestImageWebViewSource[] | null;
  pages: readonly { id: string }[];
  pageIndex: number;
  onPageIndexChange: (index: number) => void;
  onPreviewStatesChange: BestImagePreviewStatesSetter;
  onPreviewMessage: (data: string, pageId: string) => void;
  /** 预览/导出 WebView 是否携带 allowFileAccessFromFileURLs（中二为 false）。 */
  fileAccessFromFileURLs: boolean;
  /** 预览/导出 WebView 的 allowingReadAccessToURL（素材目录 URI）。 */
  allowingReadAccessToUrl: string | null | undefined;
  /** 预览等待时的占位内容（外层 loadingPreview View 由骨架提供）。 */
  loadingPreview: ReactNode;
  /** 素材准备状态条（舞萌/Phigros 各自渲染，中二为 null）。 */
  fontStatus: ReactNode;
  /** 状态条位置：Phigros 在 pageDots 之前，舞萌在之后。 */
  fontStatusAboveDots: boolean;
  exportDisabled: boolean;
  exportSpinner: boolean;
  exportIdleLabel: string;
  exportStatus: string | null;
  onExport: () => void;
  exportIndex: number | null;
  exportHeight: number;
  /** 导出画布当前页源；null 时不渲染画布。 */
  exportSource: BestImageWebViewSource | null;
  exportWebViewKeyPrefix: string;
  captureRef: BestImageCaptureRef;
  /** 导出捕获容器的无障碍标签（中二/Phigros「导出画布 第N页」；舞萌不传）。 */
  captureAccessibilityLabel?: string;
  /** 导出捕获容器背景（舞萌 '#E7EDF5'；中二/Phigros 不传）。 */
  captureBackgroundColor?: string;
  onExportMessage: (data: string) => void;
  onRequestCloseExport: () => void;
  /** 各游戏的 picker Modal（骨架内置于 ScrollView 之后）。 */
  pickers: ReactNode;
  styles: BestImageScreenShellStyles;
}) {
  const theme = useAppTheme();
  const appStateRef = useRef(AppState.currentState);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [webViewGeneration, setWebViewGeneration] = useState(0);
  const window = useWindowDimensions();
  const screenWidth = window.width > 0 ? window.width : 390;
  const previewWidth = Math.min(720, Math.max(280, screenWidth - 32));
  const previewHeight = previewWidth * 4 / 3;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const wasForeground = appStateRef.current !== 'background' && appStateRef.current !== 'inactive';
      appStateRef.current = state;
      const nextForeground = state === 'active';
      setForeground(nextForeground);
      if (!nextForeground) onRequestCloseExport();
      else if (!wasForeground) setWebViewGeneration((value) => value + 1);
    });
    return () => subscription.remove();
  }, [onRequestCloseExport]);

  return <>
    <ScrollView style={[styles.page, { backgroundColor: theme.background }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.label, { color: theme.text }]}>选择类型</Text>
      <View accessibilityRole="tablist" style={[styles.segmentedControl, { backgroundColor: theme.surfaceMuted }]}>
        {imageTypes.map((item) => {
          const selected = activeType === item.id;
          return <Pressable key={item.id} accessibilityLabel={item.label} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onSelectType(item.id)} style={[styles.segment, selected && { backgroundColor: theme.surface }]}>
            <Text style={[styles.segmentText, { color: theme.textMuted }, selected && { color: theme.accent }]}>{item.label}</Text>
          </Pressable>;
        })}
      </View>

      {customPanelBody ? <View style={[styles.customPanel, { backgroundColor: theme.surface }]}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>自定义 BestN</Text>
        {customPanelBody}
      </View> : null}

      <Text style={[styles.label, styles.sectionLabel, { color: theme.text }]}>样式选择</Text>
      <View style={[styles.styleList, { backgroundColor: theme.surface }]}>
        {styleListHeader}
        {styleRows}
      </View>

      <Text style={[styles.label, styles.sectionLabel, { color: theme.text }]}>分辨率</Text>
      <View style={styles.widthOptions}>
        {widths.map((item) => {
          const selected = activeWidth === item;
          return <Pressable key={item} accessibilityLabel={`宽度 ${item} 像素`} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => onChooseWidth(item)} style={[styles.widthOption, { backgroundColor: theme.surface, borderColor: theme.border }, selected && { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.widthOptionText, { color: theme.textMuted }, selected && { color: theme.accent }]}>{item}px</Text>
          </Pressable>;
        })}
      </View>
      <Text style={[styles.dimensionMeta, { color: theme.textMuted }]}>{dimensionMeta}</Text>

      <Text style={[styles.label, styles.sectionLabel, { color: theme.text }]}>预览</Text>
      <View accessibilityLabel="HTML图片预览窗" style={[styles.previewFrame, { width: previewWidth, height: previewHeight, backgroundColor: theme.surface, borderColor: theme.border }]}>
        {sources ? <FlatList
          data={sources}
          horizontal
          initialNumToRender={2}
          keyExtractor={(_, index) => pages[index]!.id}
          maxToRenderPerBatch={3}
          onMomentumScrollEnd={(event) => onPageIndexChange(Math.round(event.nativeEvent.contentOffset.x / previewWidth))}
          pagingEnabled
          renderItem={({ item, index }) => {
            const pageId = pages[index]!.id;
            return <View style={{ width: previewWidth, height: previewHeight }}>
              {/* 单页可能包含数十 MB 的封面数据，同时挂载多个 WebView 会触发 iOS 内存终止。 */}
              {foreground && index === pageIndex ? <WebView accessibilityLabel={`HTML图片预览 第${index + 1}页`} key={`${pageId}-${webViewGeneration}`} allowFileAccess={Platform.OS === 'android'} bounces={false} javaScriptEnabled mixedContentMode="never" originWhitelist={['about:blank', 'file://*', 'https://*']} scrollEnabled={false} source={item} style={styles.webview} testID={`${previewTestIdPrefix}-html-preview-${index}`}
                {...(fileAccessFromFileURLs ? { allowFileAccessFromFileURLs: fileAccessFromFileURLs } : {})}
                {...(allowingReadAccessToUrl ? { allowingReadAccessToURL: allowingReadAccessToUrl } : {})}
                onShouldStartLoadWithRequest={(request) => request.isTopFrame === false
                  || request.url === 'about:blank'
                  || ('uri' in item ? request.url === item.uri : request.url === item.baseUrl)}
                onError={() => updateBestImageWebViewState(onPreviewStatesChange, pageId, 'error')}
                onLoadEnd={() => markBestImageWebViewLoaded(onPreviewStatesChange, pageId)}
                onLoadStart={() => updateBestImageWebViewState(onPreviewStatesChange, pageId, 'loading')}
                onMessage={(event) => onPreviewMessage(event.nativeEvent.data, pageId)}
                onContentProcessDidTerminate={() => {
                  updateBestImageWebViewState(onPreviewStatesChange, pageId, 'terminated');
                  setWebViewGeneration((value) => value + 1);
                }}
                onRenderProcessGone={(event) => {
                  updateBestImageWebViewState(onPreviewStatesChange, pageId, event.nativeEvent.didCrash ? 'crashed' : 'terminated');
                  setWebViewGeneration((value) => value + 1);
                }}
              /> : <View accessibilityLabel={`HTML图片预览 第${index + 1}页`} style={styles.loadingPreview}>
                <ActivityIndicator color={theme.accent} size="small" />
              </View>}
            </View>;
          }}
          removeClippedSubviews={false}
          showsHorizontalScrollIndicator={false}
          style={styles.previewPager}
          windowSize={3}
        /> : <View style={styles.loadingPreview}>
          {loadingPreview}
        </View>}
      </View>
      {fontStatusAboveDots ? fontStatus : null}
      {pages.length > 1 ? <View style={styles.pageDots}>{pages.map((page, index) => <View key={page.id} style={[styles.pageDot, { backgroundColor: theme.border }, index === pageIndex && { backgroundColor: theme.accent, width: 18 }]} />)}</View> : null}
      {fontStatusAboveDots ? null : fontStatus}
      <Pressable accessibilityLabel="导出成绩图片" accessibilityRole="button" disabled={exportDisabled} onPress={() => void onExport()} style={[styles.exportButton, { backgroundColor: theme.accent }, exportDisabled && styles.exportButtonDisabled]}>
        {exportSpinner ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
        <Text style={styles.exportButtonText}>{exportStatus ?? exportIdleLabel}</Text>
      </Pressable>
    </ScrollView>

    {pickers}

    <Modal visible={foreground && exportIndex !== null} animationType="none" transparent={false} onRequestClose={onRequestCloseExport}>
      {foreground && exportIndex !== null && exportSource ? <View style={styles.exportRoot}>
        <View
          ref={captureRef}
          collapsable={false}
          style={{
            width: activeWidth / PixelRatio.get(),
            height: exportHeight / PixelRatio.get(),
            ...(captureBackgroundColor ? { backgroundColor: captureBackgroundColor } : {}),
          }}
          {...(captureAccessibilityLabel ? { accessibilityLabel: captureAccessibilityLabel } : {})}
        >
          <WebView
            accessibilityLabel={`导出渲染 第${exportIndex + 1}页`}
            key={`${exportWebViewKeyPrefix}-${exportIndex}-${activeWidth}`}
            allowFileAccess={Platform.OS === 'android'}
            androidLayerType="software"
            bounces={false}
            javaScriptEnabled
            mixedContentMode="never"
            originWhitelist={['about:blank', 'file://*', 'https://*']}
            onMessage={(event) => onExportMessage(event.nativeEvent.data)}
            onShouldStartLoadWithRequest={(request) => request.isTopFrame === false
              || request.url === 'about:blank'
              || ('uri' in exportSource ? request.url === exportSource.uri : request.url === exportSource.baseUrl)}
            onContentProcessDidTerminate={onRequestCloseExport}
            onRenderProcessGone={onRequestCloseExport}
            scrollEnabled={false}
            source={exportSource}
            style={styles.webview}
            {...(fileAccessFromFileURLs ? { allowFileAccessFromFileURLs: fileAccessFromFileURLs } : {})}
            {...(allowingReadAccessToUrl ? { allowingReadAccessToURL: allowingReadAccessToUrl } : {})}
          />
        </View>
        <View style={[styles.exportOverlay, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.accent} size="large" /><Text style={[styles.exportOverlayText, { color: theme.textSecondary }]}>{exportStatus ?? '正在准备导出'}</Text></View>
      </View> : null}
    </Modal>
  </>;
}

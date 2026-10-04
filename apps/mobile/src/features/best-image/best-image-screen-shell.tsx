import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useAppLifecycle } from '@/state/app-lifecycle';
import { recordRuntimeDiagnostic } from '@/services/runtime-diagnostics';
import { createRuntimeOperation, recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import { parseBestImageReadyMessage } from './best-image-messages';
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
  exportCancel: ViewStyle;
  exportCancelText: TextStyle;
};

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
  exportCancel: { borderWidth: 1, borderRadius: 10, marginTop: 8, paddingHorizontal: 18, paddingVertical: 10 },
  exportCancelText: { fontSize: 15, fontWeight: '700' },
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

export type BestImageScreenAppearance<TType extends string> = {

  imageTypes: readonly { id: TType; label: string }[];
  activeType: TType;
  onSelectType: (id: TType) => void;

  customPanelBody: ReactNode;

  styleListHeader: ReactNode;

  styleRows: ReactNode;
  widths: readonly number[];
  activeWidth: number;
  onChooseWidth: (width: number) => void;
  dimensionMeta: ReactNode;

  loadingPreview: ReactNode;

  fontStatus: ReactNode;

  fontStatusAboveDots: boolean;

  pickers: ReactNode;
  styles: BestImageScreenShellStyles;
};

export type BestImageScreenPreview = {

  previewTestIdPrefix: string;
  sources: readonly BestImageWebViewSource[] | null;
  pages: readonly { id: string }[];
  pageIndex: number;
  onPageIndexChange: (index: number) => void;
  onPreviewStatesChange: BestImagePreviewStatesSetter;
  onPreviewMessage: (data: string, pageId: string) => void;

  fileAccessFromFileURLs: boolean;

  allowingReadAccessToUrl: string | null | undefined;
};

export type BestImageScreenExportSession = {
  exportDisabled: boolean;
  exportSpinner: boolean;
  exportIdleLabel: string;
  exportStatus: string | null;
  onExport: () => void;
  exportIndex: number | null;
  exportHeight: number;

  exportSource: BestImageWebViewSource | null;
  exportWebViewKeyPrefix: string;
  captureRef: BestImageCaptureRef;

  captureAccessibilityLabel?: string;

  captureBackgroundColor?: string;
  onExportMessage: (data: string) => void;
  onRequestCloseExport: () => void;
  onReleaseHeavySources?: () => void;
};

export function BestImageScreenShell<TType extends string>({
  appearance,
  preview,
  exportSession,
}: {
  appearance: BestImageScreenAppearance<TType>;
  preview: BestImageScreenPreview;
  exportSession: BestImageScreenExportSession;
}) {
  const {
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
    loadingPreview,
    fontStatus,
    fontStatusAboveDots,
    pickers,
    styles,
  } = appearance;
  const {
    previewTestIdPrefix,
    sources,
    pages,
    pageIndex,
    onPageIndexChange,
    onPreviewStatesChange,
    onPreviewMessage,
    fileAccessFromFileURLs,
    allowingReadAccessToUrl,
  } = preview;
  const {
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
    onReleaseHeavySources,
  } = exportSession;
  const theme = useAppTheme();
  const lifecycle = useAppLifecycle();
  const [heavyContentBlocked, setHeavyContentBlocked] = useState(!lifecycle.foregroundReady);
  const [seenMemoryWarning, setSeenMemoryWarning] = useState(lifecycle.memoryWarningGeneration);
  const [memoryRecoveryPending, setMemoryRecoveryPending] = useState(false);
  const memoryRecoveryPendingRef = useRef(false);
  if (lifecycle.memoryWarningGeneration > seenMemoryWarning) {
    memoryRecoveryPendingRef.current = true;
    setSeenMemoryWarning(lifecycle.memoryWarningGeneration);
    setMemoryRecoveryPending(true);
    setHeavyContentBlocked(true);
  }
  const memoryRecoveryPendingNow = memoryRecoveryPending || lifecycle.memoryWarningGeneration > seenMemoryWarning;
  const heavyContentMounted = !heavyContentBlocked && !memoryRecoveryPendingNow;
  const memoryRecoveryWidth = widths.reduce<number | null>((selected, width) => (
    width < activeWidth && (selected === null || width > selected) ? width : selected
  ), null);
  const [webViewRetryGeneration, setWebViewGeneration] = useState(0);
  const webViewGeneration = `${lifecycle.foregroundGeneration}-${webViewRetryGeneration}`;
  /** 仅换源或换页建立新预览。 */
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 源和代次决定本次预览
  const previewOperation = useMemo(() => createRuntimeOperation('best-image-preview'), [sources, pageIndex, webViewGeneration, heavyContentMounted]);
  const activePreviewOperation = useRef<typeof previewOperation | null>(previewOperation);
  activePreviewOperation.current = previewOperation;
  useEffect(() => {
    activePreviewOperation.current = previewOperation;
    return () => { if (activePreviewOperation.current === previewOperation) activePreviewOperation.current = null; };
  }, [previewOperation]);
  const recordPreview = (phase: string, fields: Readonly<Record<string, unknown>>) => {
    if (activePreviewOperation.current === previewOperation) previewOperation.record(phase, fields);
  };
  const releasedMarkerRef = useRef('');
  const memoryWarningRef = useRef(lifecycle.memoryWarningGeneration);
  const window = useWindowDimensions();
  const screenWidth = window.width > 0 ? window.width : 390;
  const previewWidth = Math.min(720, Math.max(280, screenWidth - 32));
  const previewHeight = previewWidth * 4 / 3;

  const recoverFromMemoryPressure = () => {
    if (memoryRecoveryWidth !== null) onChooseWidth(memoryRecoveryWidth);
    memoryRecoveryPendingRef.current = false;
    setMemoryRecoveryPending(false);
    setHeavyContentBlocked(false);
    setWebViewGeneration((value) => value + 1);
  };

  useEffect(() => {
    const memoryWarning = lifecycle.memoryWarningGeneration > memoryWarningRef.current;
    memoryWarningRef.current = lifecycle.memoryWarningGeneration;
    const marker = `${lifecycle.phase}:${lifecycle.memoryWarningGeneration}`;
    if ((lifecycle.phase !== 'background' && !memoryWarning) || releasedMarkerRef.current === marker) return;
    releasedMarkerRef.current = marker;
    if (memoryWarning) {
      memoryRecoveryPendingRef.current = true;
      setMemoryRecoveryPending(true);
    }
    setHeavyContentBlocked(true);
    onRequestCloseExport();
    onReleaseHeavySources?.();
    void recordRuntimeDiagnostic('web-content', {
      source: 'best-image',
      lifecyclePhase: lifecycle.phase,
      webContentState: 'released',
    });
  }, [lifecycle.memoryWarningGeneration, lifecycle.phase, onReleaseHeavySources, onRequestCloseExport]);

  useEffect(() => {
    if (!lifecycle.foregroundReady || memoryRecoveryPendingRef.current) return;
    setHeavyContentBlocked(false);
  }, [lifecycle.foregroundGeneration, lifecycle.foregroundReady]);

  useEffect(() => {
    if (!heavyContentMounted || !sources) return;
    void recordRuntimeDiagnostic('web-content', {
      source: 'best-image',
      lifecyclePhase: lifecycle.phase,
      webContentState: 'mounted',
    });
  }, [heavyContentMounted, lifecycle.phase, sources]);

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
              {/** 多页同时挂载 WebView 可能触发 iOS 内存终止。 */}
              {heavyContentMounted && index === pageIndex ? <WebView accessibilityLabel={`HTML图片预览 第${index + 1}页`} key={`${pageId}-${webViewGeneration}`} allowFileAccess={Platform.OS === 'android'} bounces={false} javaScriptEnabled mixedContentMode="never" originWhitelist={['about:blank', 'file://*', 'https://*']} scrollEnabled={false} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} source={item} style={styles.webview} testID={`${previewTestIdPrefix}-html-preview-${index}`}
                {...(fileAccessFromFileURLs ? { allowFileAccessFromFileURLs: fileAccessFromFileURLs } : {})}
                {...(allowingReadAccessToUrl ? { allowingReadAccessToURL: allowingReadAccessToUrl } : {})}
                onShouldStartLoadWithRequest={(request) => request.isTopFrame === false
                  || request.url === 'about:blank'
                  || ('uri' in item ? request.url === item.uri : request.url === item.baseUrl)}
                onError={(event) => {
                  recordPreview('load-error', { result: 'error', error: event?.nativeEvent, pageIndex: index + 1 });
                  updateBestImageWebViewState(onPreviewStatesChange, pageId, 'error');
                }}
                onLoadEnd={() => {
                  recordPreview('loaded', { pageIndex: index + 1 });
                  markBestImageWebViewLoaded(onPreviewStatesChange, pageId);
                }}
                onLoadStart={() => {
                  recordPreview('loading', { pageIndex: index + 1 });
                  updateBestImageWebViewState(onPreviewStatesChange, pageId, 'loading');
                }}
                onMessage={(event) => {
                  if (parseBestImageReadyMessage(event.nativeEvent.data, activeWidth) !== null) recordPreview('ready', { pageIndex: index + 1 });
                  onPreviewMessage(event.nativeEvent.data, pageId);
                }}
                onContentProcessDidTerminate={() => {
                  recordPreview('terminated', { pageIndex: index + 1 });
                  updateBestImageWebViewState(onPreviewStatesChange, pageId, 'terminated');
                  setWebViewGeneration((value) => value + 1);
                }}
                onRenderProcessGone={(event) => {
                  recordPreview('process-gone', { pageIndex: index + 1, fatal: event.nativeEvent.didCrash });
                  updateBestImageWebViewState(onPreviewStatesChange, pageId, event.nativeEvent.didCrash ? 'crashed' : 'terminated');
                  setWebViewGeneration((value) => value + 1);
                }}
              /> : memoryRecoveryPendingNow && lifecycle.foregroundReady && index === pageIndex ? <View accessibilityLabel={`HTML图片预览 第${index + 1}页`} style={styles.loadingPreview}>
                <Text style={[styles.dimensionMeta, { color: theme.text, textAlign: 'center' }]}>内存不足，预览已暂停</Text>
                <Pressable accessibilityLabel={memoryRecoveryWidth === null ? '重新加载预览' : '降低分辨率并重新加载'} accessibilityRole="button" onPress={recoverFromMemoryPressure} style={[styles.exportButton, { backgroundColor: theme.accent }]}>
                  <Text style={styles.exportButtonText}>{memoryRecoveryWidth === null ? '重新加载预览' : `以 ${memoryRecoveryWidth} 像素重新加载`}</Text>
                </Pressable>
              </View> : <View accessibilityLabel={`HTML图片预览 第${index + 1}页`} style={styles.loadingPreview}>
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

    <Modal visible={heavyContentMounted && exportIndex !== null} animationType="none" transparent={false} onRequestClose={onRequestCloseExport}>
      {heavyContentMounted && exportIndex !== null && exportSource ? <View style={styles.exportRoot}>
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
            onError={(event) => recordRuntimeError('best-image-export', event?.nativeEvent)}
            onContentProcessDidTerminate={() => {
              recordRuntimeError('best-image-export-terminated', undefined);
              onRequestCloseExport();
            }}
            onRenderProcessGone={(event) => {
              recordRuntimeError('best-image-export-process-gone', undefined, event?.nativeEvent?.didCrash);
              onRequestCloseExport();
            }}
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            source={exportSource}
            style={styles.webview}
            {...(fileAccessFromFileURLs ? { allowFileAccessFromFileURLs: fileAccessFromFileURLs } : {})}
            {...(allowingReadAccessToUrl ? { allowingReadAccessToURL: allowingReadAccessToUrl } : {})}
          />
        </View>
        <View style={[styles.exportOverlay, { backgroundColor: theme.background }]}>
          <ActivityIndicator color={theme.accent} size="large" />
          <Text style={[styles.exportOverlayText, { color: theme.textSecondary }]}>{exportStatus ?? '正在准备导出'}</Text>
          <Pressable accessibilityLabel="取消导出" accessibilityRole="button" onPress={onRequestCloseExport} style={[styles.exportCancel, { borderColor: theme.border }]}>
            <Text style={[styles.exportCancelText, { color: theme.text }]}>取消</Text>
          </Pressable>
        </View>
      </View> : null}
    </Modal>
  </>;
}

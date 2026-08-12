import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, PixelRatio, Platform, Pressable, ScrollView, StyleSheet, Text,
  useWindowDimensions, View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';
import { useNotification } from '@/components/AppNotification';
import {
  parseBestImageHeightMessage, parseBestImageReadyMessage, parseBestImageRuntimeMessage,
} from '@/features/best-image/build-best-image-html';
import {
  BEST_IMAGE_WEBVIEW_PHASE_LABELS, markBestImageWebViewLoaded, updateBestImageWebViewRenderingState,
  updateBestImageWebViewState, useBestImageWebViewTimeout, type BestImageWebViewState,
} from '@/features/best-image/best-image-webview-state';
import {
  bestImageCaptureDimensions, bestImageExportFilename, deleteBestImageCapture,
  isDrawViewHierarchyError, requestBestImageExportPermission, saveBestImageCapture,
  shouldUseBestImageRenderInContext,
} from '@/features/best-image/best-image-export';
import {
  inlineBestImageWebViewSources, prepareAndroidBestImageWebViewSources, type BestImageWebViewSource,
} from '@/features/best-image/prepare-best-image-webview-sources';
import { useAppTheme } from '@/theme/app-theme';

const OUTPUT_WIDTHS = [1080, 1440, 2160] as const;

export function FixedBestImageScreen({
  playerName, imageType, htmlForWidth, disabled = false, notice,
}: {
  playerName: string;
  imageType: 'best30' | 'top20';
  htmlForWidth: (width: number) => string;
  disabled?: boolean;
  notice?: string | null;
}) {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const window = useWindowDimensions();
  const [width, setWidth] = useState<(typeof OUTPUT_WIDTHS)[number]>(1080);
  const [measuredHeight, setMeasuredHeight] = useState(Math.ceil(1080 * 0.75));
  const pageId = `${imageType}-${width}`;
  const [previewStates, setPreviewStates] = useState<Record<string, BestImageWebViewState>>({});
  const [androidExportSource, setAndroidExportSource] = useState<BestImageWebViewSource | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportHeight, setExportHeight] = useState(Math.ceil(1080 * 0.75));
  const exportRef = useRef<View>(null);
  const exportResolve = useRef<((height: number) => void) | null>(null);
  const exportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const html = useMemo(() => htmlForWidth(width), [htmlForWidth, width]);
  const inlineSource = useMemo(() => inlineBestImageWebViewSources([html])[0]!, [html]);

  useEffect(() => () => {
    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportTimer.current = null;
    exportResolve.current = null;
  }, []);

  useEffect(() => {
    setMeasuredHeight(Math.ceil(width * 0.75));
    setPreviewStates({ [pageId]: { phase: 'loading', version: null } });
    setSourceError(null);
    if (Platform.OS !== 'android') return;
    setAndroidExportSource(null);
    try {
      const prepared = prepareAndroidBestImageWebViewSources([html]);
      setAndroidExportSource(prepared.sources[0] ?? null);
      return prepared.dispose;
    } catch {
      setSourceError('WebView 本地导出页面准备失败');
    }
  }, [html, pageId, width]);
  const previewSource = inlineSource;
  const exportSource = Platform.OS === 'android' ? androidExportSource : inlineSource;
  const previewState = previewStates[pageId] ?? { phase: 'loading' as const, version: null };
  useBestImageWebViewTimeout(!!previewSource, pageId, previewState.phase, setPreviewStates);

  const handlePreviewMessage = (message: string) => {
    const runtime = parseBestImageRuntimeMessage(message, width);
    if (runtime) updateBestImageWebViewRenderingState(setPreviewStates, pageId, runtime.version);
    const height = parseBestImageHeightMessage(message, width, 1);
    if (height !== null) setMeasuredHeight(height);
    const ready = parseBestImageReadyMessage(message, width, 1);
    if (ready !== null) updateBestImageWebViewState(setPreviewStates, pageId, 'ready');
  };
  const handleExportMessage = (message: string) => {
    const height = parseBestImageHeightMessage(message, width, 1);
    if (height !== null) setExportHeight(height);
    const ready = parseBestImageReadyMessage(message, width, 1);
    if (ready === null || !exportResolve.current) return;
    setExportHeight(ready);
    const resolve = exportResolve.current;
    exportResolve.current = null;
    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportTimer.current = null;
    setTimeout(() => resolve(ready), 320);
  };
  const waitForExport = () => new Promise<number>((resolve, reject) => {
    setExportHeight(measuredHeight);
    exportResolve.current = resolve;
    setExporting(true);
    exportTimer.current = setTimeout(() => {
      exportResolve.current = null;
      reject(new Error('图片渲染超时'));
    }, 30_000);
  });
  const exportImage = async () => {
    if (!exportSource || disabled || exporting) return;
    let captureUri: string | null = null;
    try {
      await requestBestImageExportPermission();
      const height = await waitForExport();
      const dimensions = bestImageCaptureDimensions(width, height, PixelRatio.get(), Platform.OS);
      const useRenderInContext = shouldUseBestImageRenderInContext(Platform.OS, width, height);
      const options = { format: 'png' as const, quality: 1, result: 'tmpfile' as const, ...dimensions,
        ...(useRenderInContext ? { useRenderInContext: true } : {}) };
      try {
        captureUri = await captureRef(exportRef, options);
      } catch (error) {
        if (Platform.OS !== 'ios' || useRenderInContext || !isDrawViewHierarchyError(error)) throw error;
        captureUri = await captureRef(exportRef, { ...options, useRenderInContext: true });
      }
      await saveBestImageCapture(captureUri, bestImageExportFilename(playerName, imageType, 0, 1));
      showNotification({ title: '导出完成', message: '成绩图片已保存到相册', variant: 'success' });
    } catch (error) {
      showNotification({ title: '导出失败', message: error instanceof Error ? error.message : '无法导出成绩图片', variant: 'error' });
    } finally {
      if (exportTimer.current) clearTimeout(exportTimer.current);
      exportTimer.current = null;
      exportResolve.current = null;
      setExporting(false);
      if (captureUri) deleteBestImageCapture(captureUri);
    }
  };
  const previewWidth = Math.min(720, Math.max(280, (window.width || 390) - 32));
  const previewHeight = previewWidth * 4 / 3;
  const status = `${BEST_IMAGE_WEBVIEW_PHASE_LABELS[previewState.phase]}${previewState.version ? ` · WebView ${previewState.version}` : ''}`;

  return <>
    <ScrollView style={[styles.page, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.label, { color: theme.text }]}>分辨率</Text>
      <View style={styles.widths}>{OUTPUT_WIDTHS.map((item) => <Pressable key={item}
        accessibilityLabel={`宽度 ${item} 像素`} accessibilityRole="radio" accessibilityState={{ selected: width === item }}
        onPress={() => setWidth(item)} style={[styles.width, { backgroundColor: theme.surface, borderColor: width === item ? theme.accent : theme.border }]}>
        <Text style={[styles.widthText, { color: width === item ? theme.accent : theme.textMuted }]}>{item}px</Text>
      </Pressable>)}</View>
      {notice ? <Text accessibilityRole="alert" style={[styles.notice, { color: theme.textMuted }]}>{notice}</Text> : null}
      <Text style={[styles.label, styles.previewLabel, { color: theme.text }]}>预览</Text>
      <View accessibilityLabel="固定成绩图片预览" style={[styles.preview, { width: previewWidth, height: previewHeight, backgroundColor: theme.surface, borderColor: theme.border }]}>
        {previewSource ? <WebView allowFileAccess={Platform.OS === 'android'} allowFileAccessFromFileURLs bounces={false}
          javaScriptEnabled mixedContentMode="never" onError={() => updateBestImageWebViewState(setPreviewStates, pageId, 'error')}
          onLoadEnd={() => markBestImageWebViewLoaded(setPreviewStates, pageId)}
          onLoadStart={() => updateBestImageWebViewState(setPreviewStates, pageId, 'loading', null)}
          onMessage={(event) => handlePreviewMessage(event.nativeEvent.data)}
          onRenderProcessGone={(event) => updateBestImageWebViewState(setPreviewStates, pageId, event.nativeEvent.didCrash ? 'crashed' : 'terminated')}
          originWhitelist={['*']} scrollEnabled={false} source={previewSource} style={styles.webview} testID="fixed-best-image-preview" />
          : <ActivityIndicator color={theme.accent} />}
      </View>
      <Text style={[styles.meta, { color: theme.textMuted }]} testID="fixed-best-image-webview-status">{width} × {measuredHeight} px · {status}</Text>
      {sourceError ? <Text accessibilityRole="alert" style={[styles.sourceError, { color: theme.danger }]}>{sourceError}</Text> : null}
      <Pressable accessibilityLabel="导出成绩图片" accessibilityRole="button" disabled={!exportSource || disabled || exporting}
        onPress={() => void exportImage()} style={[styles.exportButton, { backgroundColor: theme.accent }, (!exportSource || disabled || exporting) && styles.disabled]}>
        {exporting ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}<Text style={styles.exportText}>{exporting ? '正在导出' : '导出到相册'}</Text>
      </Pressable>
    </ScrollView>
    <Modal animationType="none" onRequestClose={() => undefined} transparent={false} visible={exporting}>
      {exportSource ? <View style={styles.exportRoot}><View ref={exportRef} collapsable={false}
        style={{ width: width / PixelRatio.get(), height: exportHeight / PixelRatio.get(), backgroundColor: '#F3F6FA' }}>
        <WebView allowFileAccess={Platform.OS === 'android'} allowFileAccessFromFileURLs androidLayerType="software"
          bounces={false} javaScriptEnabled mixedContentMode="never" onMessage={(event) => handleExportMessage(event.nativeEvent.data)}
          originWhitelist={['*']} scrollEnabled={false} source={exportSource} style={styles.webview} testID="fixed-best-image-export" />
      </View><View style={[styles.overlay, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.accent} size="large" /><Text style={{ color: theme.textSecondary }}>正在准备导出</Text></View></View> : null}
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { padding: 16, paddingBottom: 32 }, label: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  widths: { flexDirection: 'row', gap: 8 }, width: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1 },
  widthText: { fontSize: 13, fontWeight: '800' }, notice: { marginTop: 12, fontSize: 12, lineHeight: 18 }, previewLabel: { marginTop: 24 },
  preview: { alignSelf: 'center', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 1 },
  webview: { width: '100%', height: '100%', flex: 1, backgroundColor: 'transparent' }, meta: { marginTop: 8, fontSize: 11, textAlign: 'center' },
  sourceError: { marginTop: 10, fontSize: 12, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
  exportButton: { minHeight: 48, marginTop: 16, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  exportText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' }, disabled: { opacity: 0.55 }, exportRoot: { flex: 1, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12 },
});

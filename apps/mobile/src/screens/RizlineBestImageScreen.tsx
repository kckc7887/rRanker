import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { File } from 'expo-file-system';
import { RemoteNativeImage } from '@/components/RemoteNativeImage';
import { ImageCropper } from '@/components/ImageCropper';
import { RizlineFilterBar } from '@/components/rizline/RizlineFilterBar';
import { RangeSelector } from '@/components/game-content/RangeSelector';
import { useGameData } from '@/hooks/use-game-data';
import { useRizlineCatalog } from '@/hooks/use-rizline-catalog';
import { useAppTheme } from '@/theme/app-theme';
import { RIZLINE_RESOURCE_BASE, rizlineCoverUrl } from '@/domain/rizline';
import { rizlinePackOptions } from '@/domain/rizline-filters';
import { BestImageScreenShell, bestImageScreenSharedStyles as styles } from '@/features/best-image/best-image-screen-shell';
import { BestImageResourcePicker } from '@/features/best-image/best-image-picker-shell';
import { useBestImageScreenController, usePreparedBestImageSources, type BestImageTemplate, type BestImageTemplateAsset } from '@/features/best-image/use-best-image-screen-controller';
import { useBestImageAssets } from '@/features/best-image/use-best-image-assets';
import { copyBestImageAsset, loadImageFiles, loadRemoteImageFile } from '@/features/best-image/load-best-image-session';
import { cropBestImageAvatar } from '@/features/best-image/crop-best-image-avatar';
import { bestImageExportFilename } from '@/features/best-image/best-image-export';
import { parseBestImageQuantity } from '@/features/best-image/best-image-custom';
import { defaultRizlineImageFilters, validRizlineImageFilters, customRizlineRecords, rizlineImagePages, type RizlineBestImageType } from '@/features/rizline-best-image/rizline-best-image';
import { DEFAULT_RIZLINE_IMAGE_PREFERENCES, rizlineImagePreferencesStore, type RizlineImagePreferences } from '@/features/rizline-best-image/rizline-best-image-preferences';
import { prepareRizlineUi } from '@/features/rizline-best-image/rizline-ui-cache';
import { buildRizlineCardBackground, buildRizlineHeader, buildRizlineBestImageHtml } from '@/features/rizline-best-image/build-rizline-best-image-html';

const LABELS = { avatar: '头像', layout: '名片背景', signature1: '签名1', signature2: '签名2', background: '背景' };
type Picker = keyof typeof LABELS;
type PickerItem = { id: string; name: string; uri: string | null };
const preferences = { load: (id: string) => rizlineImagePreferencesStore.load(id), save: (id: string, value: RizlineImagePreferences) => rizlineImagePreferencesStore.save(id, value) };
const resourceUrl = (path: string) => `${RIZLINE_RESOURCE_BASE}/${path}`;

export function RizlineBestImageScreen() {
  const theme = useAppTheme(); const query = useGameData(); const catalogQuery = useRizlineCatalog();
  const payload = query.data?.payload.kind === 'rizline' ? query.data.payload : null;
  const catalog = catalogQuery.data?.snapshot;
  const songs = useMemo(() => catalog?.songs ?? [], [catalog]);
  const songById = useMemo(() => new Map(songs.map(song => [song.id, song])), [songs]);
  const [filters, setFilters] = useState(defaultRizlineImageFilters);
  const [collapsed, setCollapsed] = useState(false);
  const [cropSongId, setCropSongId] = useState<string | null>(null);
  const controller = useBestImageScreenController<RizlineBestImageType, RizlineImagePreferences, Picker>({
    accountId: query.activeAccountId, game: 'rizline', defaultType: 'best40', defaultWidth: 1080,
    defaultQuantityText: '40', defaultPreferences: DEFAULT_RIZLINE_IMAGE_PREFERENCES, preferences,
    defaultExportHeight: width => Math.ceil(width * 0.75), messageScale: 1, previewRenderingGuard: true,
  });
  const { assetSession: session, prefs, prefsReady, setPrefs, type, setType, width, setWidth, picker, setPicker,
    quantityText, setQuantityText, pageIndex, setPageIndex, pageHeights, previewStates, setPreviewStates,
    handlePreviewMessage, exportIndex, exportHeight, exportStatus, exportCaptureRef, handleExportMessage,
    handleExportLayout, cancelExportRequest } = controller;
  const formValid = type === 'best40' || validRizlineImageFilters(filters, quantityText);
  const customRecords = useMemo(() => payload && formValid && type === 'custom'
    ? customRizlineRecords(payload.records, songs, filters, parseBestImageQuantity(quantityText) ?? 40) : [], [payload, formValid, type, songs, filters, quantityText]);
  const pages = useMemo(() => payload ? rizlineImagePages(type, payload.best, customRecords) : [], [payload, type, customRecords]);
  const records = useMemo(() => pages.flatMap(page => page.sections.flatMap(section => section.records)), [pages]);
  const hasRecords = records.length > 0;
  const defaultSong = payload?.records.map(record => songById.get(record.songId)).find(song => song?.coverPath) ?? songs.find(song => song.coverPath);
  const avatarSong = songById.get(prefs.avatar.songId ?? '') ?? defaultSong;
  const backgroundSong = songById.get(prefs.backgroundId ?? '') ?? defaultSong;
  const layout = catalog?.layouts.find(row => row.id === prefs.layoutId) ?? catalog?.layouts.find(row => row.id === 'layout.00001') ?? catalog?.layouts[0];
  const avatarUrl = avatarSong ? rizlineCoverUrl(avatarSong) : null;
  const backgroundUrl = backgroundSong ? rizlineCoverUrl(backgroundSong) : null;
  const signatureText = (part: 1 | 2) => catalog?.signatures.find(row => row.part === part && row.id === prefs[part === 1 ? 'signature1' : 'signature2'])?.text ?? '';
  const signature = [signatureText(1), signatureText(2)].filter(Boolean).join(' ');
  const activeCrop = avatarSong?.id === prefs.avatar.songId ? prefs.avatar.crop : null;
  const drawing = useBestImageAssets({ session, key: prefsReady ? 'ui' : null, prepare: async signal => {
    const ui = await prepareRizlineUi(undefined, signal); await ui.fullReady;
    for (const path of ui.files) await copyBestImageAsset(session, new File(ui.directory, path).uri, path, signal);
    return { header: await new File(session.directory, 'header/base.svg').text() };
  } });
  const coverRequests = useMemo(() => [...new Set(records.map(record => record.songId))].map(id => [id, songById.get(id)?.coverPath ?? null] as const), [records, songById]);
  const game = useBestImageAssets({ session,
    key: prefsReady && catalog ? JSON.stringify([coverRequests, avatarUrl, activeCrop, backgroundUrl, layout?.imagePath]) : null,
    prepare: async signal => {
      const [covers, originalAvatar, background, namecard] = await Promise.all([
        loadImageFiles(session, coverRequests.map(([id]) => id), id => { const song = songById.get(id); return song ? rizlineCoverUrl(song) : null; }, undefined, signal),
        loadRemoteImageFile(session, avatarUrl, signal), loadRemoteImageFile(session, backgroundUrl, signal),
        loadRemoteImageFile(session, layout ? resourceUrl(layout.imagePath) : null, signal),
      ]);
      const avatar = originalAvatar ? await cropBestImageAvatar(session, originalAvatar, activeCrop, signal) : null;
      return { covers, avatar, background, namecard };
    },
  });
  const cropSource = cropSongId ? songById.get(cropSongId) : null;
  const cropAsset = useBestImageAssets({ session, key: cropSource?.coverPath ?? null,
    prepare: signal => loadRemoteImageFile(session, cropSource ? rizlineCoverUrl(cropSource) : null, signal) });
  const template = useMemo<BestImageTemplate | null>(() => {
    if (!drawing.data || !game.data || !payload || !hasRecords || !formValid) return null;
    const file = (path: string) => new File(session.directory, path).uri;
    const assets: BestImageTemplateAsset[] = records.map(record => ({
      id: record.chartId, key: record.difficulty,
      sources: [file(`card/${record.difficulty}.svg`), file('card/mask.svg'), file('artwork/clear-mask.svg'), file('artwork/soft-mask.svg'), file('artwork/glow-mask.svg'),
        ...(game.data!.covers[record.songId] ? [game.data!.covers[record.songId]!] : [])], build: buildRizlineCardBackground,
    }));
    let header = drawing.data.header;
    if (layout?.colors) header = header.replace('#12d6df', layout.colors.background[0]).replace('#f70fff', layout.colors.background[1]);
    const sources = [file('header/mask.svg'), file('header/avatar-mask.svg'), file('header/avatar-frame.svg'), file('header/RKS.svg')];
    const layoutIndex = game.data.namecard ? sources.push(game.data.namecard) - 1 : -1;
    const avatarIndex = game.data.avatar ? sources.push(game.data.avatar) - 1 : -1;
    assets.push({ id: 'header', key: JSON.stringify([layout?.id, layout?.colors, header, layoutIndex, avatarIndex]), sources,
      build: data => buildRizlineHeader(data, header, layoutIndex, avatarIndex) });
    return { assets, build: urls => pages.map(page => buildRizlineBestImageHtml({ width, page, player: payload.player,
      signature, signatureColor: layout?.colors?.text ?? '#fff', background: game.data!.background, urls, dataSource: payload.source.label })) };
  }, [drawing.data, game.data, payload, hasRecords, formValid, session.directory, records, layout, pages, width, signature]);
  const prepared = usePreparedBestImageSources(template, session, drawing.ready ? session.directory : null, cancelExportRequest);
  const items = useMemo<PickerItem[]>(() => {
    if (picker === 'layout') return (catalog?.layouts ?? []).map(row => ({ id: row.id, name: row.id, uri: resourceUrl(row.imagePath) }));
    if (picker === 'signature1' || picker === 'signature2') return (catalog?.signatures ?? []).filter(row => row.part === (picker === 'signature1' ? 1 : 2)).map(row => ({ id: row.id, name: row.text, uri: null }));
    return songs.filter(song => song.coverPath).map(song => ({ id: song.id, name: song.title, uri: rizlineCoverUrl(song) }));
  }, [catalog, picker, songs]);
  const choiceId = picker === 'avatar' ? avatarSong?.id : picker === 'background' ? backgroundSong?.id : picker === 'layout' ? layout?.id : picker ? prefs[picker] : null;
  const preview = (kind: Picker) => kind === 'avatar' ? game.data?.avatar : kind === 'background' ? backgroundUrl : kind === 'layout' && layout ? resourceUrl(layout.imagePath) : null;
  const label = (kind: Picker) => kind === 'avatar' ? avatarSong?.title : kind === 'background' ? backgroundSong?.title : kind === 'layout' ? layout?.id : signatureText(kind === 'signature1' ? 1 : 2);
  const changeFilter = <K extends keyof typeof filters>(key: K, value: typeof filters[K]) => { setFilters(current => ({ ...current, [key]: value })); setPageIndex(0); };
  const canExport = !!prepared.sources && hasRecords && formValid;
  if (!payload || !catalog) return <View style={[local.center, { backgroundColor: theme.background }]}>
    {query.isPending || catalogQuery.isPending ? <ActivityIndicator /> : <><Text style={{ color: theme.textMuted }}>当前账号没有可生成的 Rizline 成绩</Text><Pressable onPress={() => void Promise.all([query.refetch(), catalogQuery.refetch()])}><Text style={{ color: theme.accent }}>重新加载</Text></Pressable></>}
  </View>;
  return <BestImageScreenShell appearance={{
    imageTypes: [{ id: 'best40', label: 'Best40' }, { id: 'custom', label: '自定义' }], activeType: type,
    onSelectType: value => { setType(value); setPageIndex(0); },
    customPanelBody: type === 'custom' ? <>
      <RizlineFilterBar packs={rizlinePackOptions(songs)} constantBounds={{ minimum: 0, maximum: Math.max(16, ...songs.flatMap(song => song.charts.map(chart => chart.constant ?? 0))) }} filter={{ ...filters, collapsed, setCollapsed,
        setDifficulty: value => changeFilter('difficulty', value), setPackId: value => changeFilter('packId', value), setConstantMin: value => changeFilter('constantMin', value), setConstantMax: value => changeFilter('constantMax', value),
        clearFilters: () => { setFilters(defaultRizlineImageFilters()); setQuantityText('40'); setPageIndex(0); } }} />
      <Text style={{ color: theme.text }}>达成率</Text><RangeSelector minimum={0} maximum={120} step={0.01} lowerValue={filters.accuracyMin} upperValue={filters.accuracyMax}
        onLowerValueChange={value => changeFilter('accuracyMin', value)} onUpperValueChange={value => changeFilter('accuracyMax', value)} formatValue={value => `${value.toFixed(2)}%`} accessibilityLabel="达成率范围" />
      <Text style={{ color: theme.text }}>数量</Text><TextInput value={quantityText} onChangeText={value => { setQuantityText(value); setPageIndex(0); }} keyboardType="number-pad" placeholder="0 为全部" placeholderTextColor={theme.textMuted} style={[styles.textInput, { color: theme.text, borderColor: theme.border }]} />
      {!formValid ? <Text style={{ color: theme.danger }}>请输入有效范围和非负整数数量</Text> : !hasRecords ? <Text style={{ color: theme.textMuted }}>没有符合条件的成绩</Text> : null}
    </> : null,
    styleListHeader: null,
    styleRows: (Object.keys(LABELS) as Picker[]).map(kind => <Pressable key={kind} style={styles.styleRow} onPress={() => setPicker(kind)}>
      <View style={styles.stylePreview}>{preview(kind) ? <RemoteNativeImage cacheProfile="thumbnail" gameId="rizline" source={{ uri: preview(kind)! }} resizeMode="cover" style={kind === 'avatar' ? local.avatar : local.background} /> : <Text style={{ color: theme.textMuted }}>{kind.startsWith('signature') ? 'Aa' : '—'}</Text>}</View>
      <View style={styles.styleCopy}><Text style={[styles.styleName, { color: theme.text }]}>{LABELS[kind]}</Text><Text numberOfLines={1} style={[styles.styleValue, { color: theme.textMuted }]}>{label(kind) || '未设置'}</Text></View><Text style={{ color: theme.textMuted }}>›</Text>
    </Pressable>),
    widths: [1080, 1440, 2160], activeWidth: width, onChooseWidth: setWidth,
    dimensionMeta: `${width} × ${pageHeights[pages[pageIndex]?.id ?? ''] ?? Math.ceil(width * 0.75)} px · 每页最多 40 张`,
    preparation: { drawingReady: drawing.ready, gameReady: game.ready && prepared.ready,
      error: drawing.error ?? game.error ?? prepared.error ?? (!hasRecords ? '没有符合条件的成绩' : null), retry: () => { drawing.retry(); game.retry(); prepared.retry(); } },
    pickers: <>
      <BestImageResourcePicker visible={picker !== null} label={picker ? LABELS[picker] : ''} items={items} getKey={item => item.id} getName={item => item.name} getMeta={() => ''}
        renderPreview={item => item.uri ? <RemoteNativeImage gameId="rizline" cacheProfile="thumbnail" source={{ uri: item.uri }} resizeMode="cover" style={picker === 'avatar' ? local.avatar : local.background} /> : <Text style={{ color: theme.text }}>{item.name}</Text>}
        isSelected={item => item.id === choiceId} onClose={() => setPicker(null)}
        aboveList={picker === 'avatar' && avatarSong ? <Pressable style={local.action} onPress={() => { setCropSongId(avatarSong.id); setPicker(null); }}><Text style={{ color: theme.accent }}>调整当前头像</Text></Pressable> : null}
        quickChoices={picker === 'signature1' || picker === 'signature2' ? [{ label: '清空', selected: !prefs[picker], onPress: () => { setPrefs(value => ({ ...value, [picker]: null })); setPicker(null); } }] : []}
        onSelect={item => {
          if (picker === 'avatar') setCropSongId(item.id);
          else if (picker === 'background') setPrefs(value => ({ ...value, backgroundId: item.id }));
          else if (picker === 'layout') setPrefs(value => ({ ...value, layoutId: item.id }));
          else if (picker) setPrefs(value => ({ ...value, [picker]: item.id }));
          setPicker(null);
        }} />
      {cropSongId && cropAsset.data ? <ImageCropper key={cropSongId} uri={cropAsset.data} initialCrop={cropSongId === prefs.avatar.songId ? prefs.avatar.crop : null}
        onCancel={() => setCropSongId(null)} onConfirm={crop => { setPrefs(value => ({ ...value, avatar: { songId: cropSongId, crop } })); setCropSongId(null); }} /> : null}
      {cropSongId && !cropAsset.data ? <View style={[local.cropLoading, { backgroundColor: theme.surface }]}><Text style={{ color: theme.text }}>{cropAsset.error ?? (cropAsset.ready ? '头像资源不可用' : '正在加载头像')}</Text><Pressable onPress={cropAsset.retry}><Text style={{ color: theme.accent }}>重试</Text></Pressable><Pressable onPress={() => setCropSongId(null)}><Text style={{ color: theme.textMuted }}>取消</Text></Pressable></View> : null}
    </>, styles,
  }} preview={{ previewTestIdPrefix: 'rizline-best-image', sources: prepared.sources, previewStates, pages, pageIndex,
    onPageIndexChange: setPageIndex, onPreviewStatesChange: setPreviewStates, onPreviewMessage: handlePreviewMessage,
    fileAccessFromFileURLs: true, allowingReadAccessToUrl: session.directory.uri }}
  exportSession={{ exportDisabled: !canExport || !!exportStatus, exportSpinner: !!exportStatus, exportIdleLabel: '导出到相册', exportStatus,
    onExport: () => void controller.exportImages({ pages, htmlPages: prepared.htmlPages, sources: prepared.sources, canExport,
      buildExportFilename: (index, total) => bestImageExportFilename(payload.player.username, type, index, total) }),
    exportIndex, exportHeight, exportSource: exportIndex === null ? null : prepared.sources?.[exportIndex] ?? null,
    exportWebViewKeyPrefix: 'rizline-export', captureRef: exportCaptureRef, onExportMessage: handleExportMessage,
    onExportLayout: handleExportLayout, onRequestCloseExport: cancelExportRequest }} />;
}
const local = StyleSheet.create({ center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }, avatar: { width: 48, height: 48, borderRadius: 24 }, background: { width: 110, height: 48, borderRadius: 8 }, action: { padding: 16 }, cropLoading: { position: 'absolute', inset: 24, justifyContent: 'center', alignItems: 'center', gap: 20 } });

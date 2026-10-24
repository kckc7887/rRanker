import { bestImageUiProgress } from '@/features/best-image/best-image-ui-cache';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { File } from 'expo-file-system';
import { RemoteNativeImage } from '@/components/RemoteNativeImage';
import { ImageCropper } from '@/components/ImageCropper';
import { RizlineFilterBar } from '@/components/rizline/RizlineFilterBar';
import { RangeSelector } from '@/components/game-content/RangeSelector';
import { useGameData } from '@/hooks/use-game-data';
import { useRizlineCatalog } from '@/hooks/use-rizline-catalog';
import { useAppTheme } from '@/theme/app-theme';
import { RIZLINE_RESOURCE_BASE, rizlineCoverUrl, sortRizlineRecords } from '@/domain/rizline';
import { rizlinePackOptions } from '@/domain/rizline-filters';
import { BestImageScreenShell, bestImageScreenSharedStyles as styles } from '@/features/best-image/best-image-screen-shell';
import { TrophyPreview } from '@/features/best-image/best-image-collection-picker';
import { BestImageResourcePicker } from '@/features/best-image/best-image-picker-shell';
import { useBestImageScreenController, usePreparedBestImageSources, type BestImageTemplate, type BestImageTemplateAsset } from '@/features/best-image/use-best-image-screen-controller';
import { useBestImageAssets } from '@/features/best-image/use-best-image-assets';
import { copyBestImageAsset, loadImageFiles, loadRemoteImageFile } from '@/features/best-image/load-best-image-session';
import { cropBestImageAvatar } from '@/features/best-image/crop-best-image-avatar';
import { bestImageExportFilename } from '@/features/best-image/best-image-export';
import { parseBestImageQuantity } from '@/features/best-image/best-image-custom';
import { defaultRizlineImageFilters, rizlineAvatarCrop, validRizlineImageFilters, customRizlineRecords, rizlineImagePages, type RizlineBestImageType } from '@/features/rizline-best-image/rizline-best-image';
import { DEFAULT_RIZLINE_IMAGE_PREFERENCES, rizlineImagePreferencesStore, type RizlineImagePreferences, type RizlineSignatureChoice } from '@/features/rizline-best-image/rizline-best-image-preferences';
import { prepareRizlineUi } from '@/features/rizline-best-image/rizline-ui-cache';
import { buildRizlineCardBackground, buildRizlineHeader, buildRizlineBestImageHtml } from '@/features/rizline-best-image/build-rizline-best-image-html';

const LABELS = { avatar: '头像', namecard: '名片背景', signature1: '签名1', signature2: '签名2', background: '背景' };
type Picker = keyof typeof LABELS;
type PickerItem = { id: string; aliases: string[]; name: string; uri: string | null; meta: string };
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
  const [cropId, setCropId] = useState<string | null>(null);
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
  const images = useMemo<PickerItem[]>(() => (catalog?.illustrations ?? []).map(row => ({
    ...row, uri: resourceUrl(row.imagePath), meta: row.id,
  })), [catalog]);
  const signatures = useMemo(() => (catalog?.signatures ?? []).map(row => ({
    ...row, name: row.text, uri: null, meta: row.id,
  })), [catalog]);
  const findImage = (id?: string | null) => images.find(row => row.id === id || row.aliases.includes(id ?? ''));
  const defaultSong = sortRizlineRecords(payload?.records ?? []).map(record => songById.get(record.songId)).find(song => song?.coverPath);
  const fallback = findImage(defaultSong ? `illustration.${defaultSong.id}` : null)
    ?? images.find(row => row.uri === (defaultSong ? rizlineCoverUrl(defaultSong) : null))
    ?? images.find(row => row.id.startsWith('illustration.') && row.name === defaultSong?.title) ?? images[0];
  const card = payload?.player.rizcard;
  const currentAvatar = findImage(card?.avatarId);
  const currentBackground = findImage(card?.backgroundId);
  const selectedImage = (kind: 'avatar' | 'namecard' | 'background') => {
    const choice = prefs[kind];
    return (choice.mode === 'current' ? kind === 'avatar' ? currentAvatar : currentBackground : findImage(choice.id)) ?? fallback;
  };
  const avatar = selectedImage('avatar'); const namecard = selectedImage('namecard'); const background = selectedImage('background');
  const selectedSignature = (part: 1 | 2) => {
    const choice = prefs[part === 1 ? 'signature1' : 'signature2'];
    const id = choice.mode === 'current' ? card?.[part === 1 ? 'bioId1' : 'bioId2'] : choice.mode === 'off' ? null : choice.id;
    return signatures.find(row => row.part === part && (row.id === id || row.aliases.includes(id ?? '')));
  };
  const signature = [selectedSignature(1)?.text, selectedSignature(2)?.text].filter(Boolean).join(' ');
  const activeCrop = useMemo(() => prefs.avatar.mode === 'current'
    ? currentAvatar ? rizlineAvatarCrop(card?.avatarPos) : null : prefs.avatar.crop ?? null, [prefs.avatar, currentAvatar, card]);
  useEffect(() => { setCropId(null); }, [query.activeAccountId]);
  const drawing = useBestImageAssets({ session, key: prefsReady ? 'ui' : null, prepare: async (signal, onProgress) => {
    const ui = await prepareRizlineUi(progress => onProgress(bestImageUiProgress(progress)), signal); await ui.fullReady;
    for (const path of ui.files) await copyBestImageAsset(session, new File(ui.directory, path).uri, path, signal);
    return { header: await new File(session.directory, 'header/base.svg').text() };
  } });
  const coverRequests = useMemo(() => [...new Set(records.map(record => record.songId))].map(id => [id, songById.get(id)?.coverPath ?? null] as const), [records, songById]);
  const game = useBestImageAssets({ session,
    key: prefsReady && catalog ? JSON.stringify([coverRequests, avatar?.uri, activeCrop, background?.uri, namecard?.uri]) : null,
    prepare: async (signal, onProgress) => {
      const [covers, originalAvatar, backgroundFile, namecardFile] = await Promise.all([
        loadImageFiles(session, coverRequests.map(([id]) => id), id => { const song = songById.get(id); return song ? rizlineCoverUrl(song) : null; }, (done, total) => onProgress(total ? .9 * done / total : .9), signal),
        loadRemoteImageFile(session, avatar?.uri ?? null, signal), loadRemoteImageFile(session, background?.uri ?? null, signal),
        loadRemoteImageFile(session, namecard?.uri ?? null, signal),
      ]);
      const cropped = originalAvatar ? await cropBestImageAvatar(session, originalAvatar, activeCrop, signal) : null;
      return { covers, avatar: cropped, background: backgroundFile, namecard: namecardFile };
    },
  });
  const cropSource = findImage(cropId);
  const cropAsset = useBestImageAssets({ session, key: cropId ? cropSource?.uri ?? null : null,
    prepare: signal => loadRemoteImageFile(session, cropSource?.uri ?? null, signal) });
  const template = useMemo<BestImageTemplate | null>(() => {
    if (!drawing.data || !game.data || !payload || !hasRecords || !formValid) return null;
    const file = (path: string) => new File(session.directory, path).uri;
    const assets: BestImageTemplateAsset[] = records.map(record => ({
      id: record.chartId, key: record.difficulty,
      sources: [file(`card/${record.difficulty}.svg`),
        ...(game.data!.covers[record.songId] ? [game.data!.covers[record.songId]!] : [])], build: buildRizlineCardBackground,
    }));
    const header = drawing.data.header;
    const sources = [file('header/mask.svg'), file('header/avatar-mask.svg'), file('header/avatar-frame.svg'), file('header/RKS.svg')];
    const backgroundIndex = game.data.namecard ? sources.push(game.data.namecard) - 1 : -1;
    const avatarIndex = game.data.avatar ? sources.push(game.data.avatar) - 1 : -1;
    assets.push({ id: 'header', key: JSON.stringify([header, backgroundIndex, avatarIndex]), sources,
      build: data => buildRizlineHeader(data, header, backgroundIndex, avatarIndex) });
    return { brand: true, assets, build: urls => pages.map(page => buildRizlineBestImageHtml({ width, page, player: payload.player,
      signature, background: game.data!.background, urls, dataSource: payload.source.label })) };
  }, [drawing.data, game.data, payload, hasRecords, formValid, session.directory, records, pages, width, signature]);
  const prepared = usePreparedBestImageSources(template, session, drawing.ready ? session.directory : null, cancelExportRequest);
  const isSignature = picker === 'signature1' || picker === 'signature2';
  const items = isSignature ? signatures.filter(row => row.part === (picker === 'signature1' ? 1 : 2)) : images;
  const selection = picker ? prefs[picker] : null;
  const choose = (choice: RizlineSignatureChoice) => {
    if (!picker) return;
    if (picker === 'signature1' || picker === 'signature2') setPrefs(value => ({ ...value, [picker]: choice }));
    else if (choice.mode !== 'off') setPrefs(value => ({ ...value, [picker]: choice }));
    setPicker(null);
  };
  const selected = (kind: Picker) => kind === 'signature1' || kind === 'signature2'
    ? selectedSignature(kind === 'signature1' ? 1 : 2) : selectedImage(kind);
  const label = (kind: Picker) => {
    const mode = prefs[kind].mode; const name = selected(kind)?.name;
    return mode === 'current' ? `玩家当前${LABELS[kind]}${name ? ` · ${name}` : ''}`
      : mode === 'off' ? '关闭' : `${mode === 'random' ? '随机 · ' : ''}${name ?? '未设置'}`;
  };
  const preview = (kind: Picker) => kind === 'avatar' ? game.data?.avatar ?? avatar?.uri : selected(kind)?.uri;
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
    styleRows: (Object.keys(LABELS) as Picker[]).map(kind => <Pressable key={kind} style={({ pressed }) => [styles.styleRow, { borderBottomColor: theme.border }, pressed && { backgroundColor: theme.surfaceMuted }]} onPress={() => setPicker(kind)}>
      <View style={styles.stylePreview}>{preview(kind) ? <RemoteNativeImage cacheProfile="thumbnail" gameId="rizline" source={{ uri: preview(kind)! }} resizeMode="cover" style={kind === 'avatar' ? local.avatar : local.background} /> : kind.startsWith('signature') ? <TrophyPreview fallback={selected(kind)?.name} /> : <Text style={{ color: theme.textMuted }}>—</Text>}</View>
      <View style={styles.styleCopy}><Text style={[styles.styleName, { color: theme.text }]}>{LABELS[kind]}</Text><Text numberOfLines={1} style={[styles.styleValue, { color: theme.textMuted }]}>{label(kind) || '未设置'}</Text></View><Text style={{ color: theme.textMuted }}>›</Text>
    </Pressable>),
    widths: [1080, 1440, 2160], activeWidth: width, onChooseWidth: setWidth,
    dimensionMeta: `${width} × ${pageHeights[pages[pageIndex]?.id ?? ''] ?? Math.ceil(width * 0.75)} px · 每页最多 40 张`,
    preparation: { drawingReady: drawing.ready, drawingProgress: drawing.progress, gameProgress: .8 * game.progress + .2 * prepared.progress, gameReady: game.ready && prepared.ready,
      error: drawing.error ?? game.error ?? prepared.error ?? (!hasRecords ? '没有符合条件的成绩' : null), retry: () => { drawing.retry(); game.retry(); prepared.retry(); } },
    pickers: <>
      <BestImageResourcePicker visible={picker !== null} label={picker ? LABELS[picker] : ''} items={items} getKey={item => item.id} getName={item => item.name} getMeta={item => item.meta}
        searchText={item => [item.name, item.id, ...item.aliases].join(' ')}
        renderPreview={item => item.uri ? <RemoteNativeImage gameId="rizline" cacheProfile="thumbnail" source={{ uri: item.uri }} resizeMode="cover" style={picker === 'avatar' ? local.avatar : local.background} /> : <TrophyPreview fallback={item.name} />}
        isSelected={item => selection?.mode === 'item' && selection.id === item.id} onClose={() => setPicker(null)}
        aboveList={picker === 'avatar' && avatar ? <Pressable style={local.action} onPress={() => { setCropId(avatar.id); setPicker(null); }}><Text style={{ color: theme.accent }}>调整当前头像</Text></Pressable> : null}
        currentChoice={{ label: `使用玩家当前${picker ? LABELS[picker] : ''}`, selected: selection?.mode === 'current', onPress: () => choose({ mode: 'current' }) }}
        quickChoices={[
          { label: '随机', actionLabel: `随机${picker ? LABELS[picker] : ''}`, icon: '↻', selected: selection?.mode === 'random', disabled: !items.length, onPress: () => {
            const item = items[Math.floor(Math.random() * items.length)]; if (item) choose({ mode: 'random', id: item.id });
          } },
          ...(isSignature ? [{ label: '关闭', actionLabel: `关闭${picker ? LABELS[picker] : ''}`, icon: '×', selected: selection?.mode === 'off', onPress: () => choose({ mode: 'off' }) }] : []),
        ]}
        onSelect={item => { if (picker === 'avatar') { setCropId(item.id); setPicker(null); } else choose({ mode: 'item', id: item.id }); }} />
      {cropId && cropAsset.data ? <ImageCropper key={`${query.activeAccountId}:${cropId}`} uri={cropAsset.data} initialCrop={cropId === avatar?.id ? activeCrop : null}
        onCancel={() => setCropId(null)} onConfirm={crop => { setPrefs(value => ({ ...value, avatar: { mode: 'item', id: cropId, crop } })); setCropId(null); }} /> : null}
      <Modal visible={!!cropId && !cropAsset.data} transparent animationType="fade" onRequestClose={() => setCropId(null)}>
        <View style={[local.center, { backgroundColor: theme.background }]}><Text style={{ color: theme.text }}>{cropAsset.error ?? (cropAsset.ready ? '头像资源不可用' : '正在加载头像')}</Text>
          {cropAsset.error || cropAsset.ready ? <Pressable onPress={cropAsset.retry}><Text style={{ color: theme.accent }}>重试</Text></Pressable> : <ActivityIndicator color={theme.accent} />}
          <Pressable onPress={() => setCropId(null)}><Text style={{ color: theme.textMuted }}>取消</Text></Pressable></View>
      </Modal>
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
const local = StyleSheet.create({ center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }, avatar: { width: 48, height: 48, borderRadius: 24 }, background: { width: 128, height: 48, borderRadius: 10 }, action: { padding: 16 } });

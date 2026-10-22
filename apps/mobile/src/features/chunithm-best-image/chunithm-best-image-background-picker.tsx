import { StyleSheet } from 'react-native';
import type { ChunithmSong } from '@/domain/chunithm';
import { BestImageResourcePicker } from '@/features/best-image/best-image-picker-shell';
import { RemoteNativeImage as Image } from '@/components/RemoteNativeImage';
import type { ChunithmBestImageBackgroundChoice } from './chunithm-best-image-preferences';
import { chunithmBestImageJacketUrl } from './load-chunithm-best-image-jackets';

export function ChunithmBestImageBackgroundPicker({ visible, songs, selection, onClose, onSelect }: {
  visible: boolean;
  songs: readonly ChunithmSong[];
  selection: ChunithmBestImageBackgroundChoice;
  onClose: () => void;
  onSelect: (choice: ChunithmBestImageBackgroundChoice) => void;
}) {
  return <BestImageResourcePicker
    visible={visible}
    label="背景"
    title="选择歌曲背景"
    items={songs}
    getKey={song => String(song.id)}
    getName={song => song.title}
    getMeta={song => `${song.artist?.trim() || '未知艺术家'} · ID${song.id}`}
    searchText={song => `${song.title} ${song.artist ?? ''} ${song.id}`}
    searchLabel="搜索背景歌曲"
    searchPlaceholder="搜索标题、艺术家或歌曲 ID"
    countUnit="首歌曲"
    itemLabel={song => `使用${song.title}作为背景`}
    renderPreview={song => <Image cacheProfile="thumbnail" gameId="chunithm" source={{ uri: chunithmBestImageJacketUrl(String(song.id)) }} style={styles.preview} resizeMode="cover" />}
    isSelected={song => selection.mode === 'song' && selection.songId === song.id}
    onSelect={song => onSelect({ mode: 'song', songId: song.id })}
    onClose={onClose}
    quickChoices={[{ label: '默认背景', actionLabel: '使用默认背景', icon: '×', selected: selection.mode === 'default', onPress: () => onSelect({ mode: 'default' }) }]}
  />;
}

const styles = StyleSheet.create({ preview: { width: 128, height: 48, borderRadius: 10 } });

import { ScrollView, StyleSheet } from 'react-native';
import type { OsuGameId } from '@/domain/game-mode-family';
import { AppSheet } from '@/components/AppSheet';
import { OsuModeSelectContent } from './OsuModeSelectContent';

export function OsuModeSelectSheet({ visible, alreadyBound, busy, onClose, onSubmit, submitLabel = '绑定选中模式' }: {
  visible: boolean;
  alreadyBound: readonly OsuGameId[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (selected: readonly OsuGameId[]) => void;
  submitLabel?: string;
}) {
  return (
    <AppSheet visible={visible} onRequestClose={busy ? undefined : onClose} title="选择 osu! 模式"
      leftAction={{ label: '取消', accessibilityLabel: '关闭模式选择', disabled: busy, onPress: onClose }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <OsuModeSelectContent
          alreadyBound={alreadyBound}
          busy={busy}
          submitLabel={submitLabel}
          onSubmit={onSubmit}
        />
      </ScrollView>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingTop: 8 },
});

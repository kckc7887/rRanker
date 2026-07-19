import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { TagEditor } from '@/components/TagEditor';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { GestureHandlerRootView: RN.View, Pressable: RN.Pressable };
});

describe('标签预设编辑器', () => {
  it('supports multi-select and commits once on completion', async () => {
    const onChange = jest.fn(async () => undefined);
    const screen = await render(<TagEditor tags={['已有']} presets={['爆发', '交互']}
      historyTags={['历史']} onChange={onChange} onPresetsChange={jest.fn(async () => undefined)} />);

    await fireEvent.press(screen.getByLabelText('打开标签预设'));
    await fireEvent.press(screen.getByLabelText('选择标签 爆发'));
    await fireEvent.press(screen.getByLabelText('选择标签 历史'));
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('完成标签选择'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['已有', '爆发', '历史']));
  });

  it('copies a history tag into presets using the accessible alternative', async () => {
    const onPresetsChange = jest.fn(async () => undefined);
    const screen = await render(<TagEditor tags={[]} presets={['爆发']} historyTags={['星星']}
      onChange={jest.fn(async () => undefined)} onPresetsChange={onPresetsChange} />);

    await fireEvent.press(screen.getByLabelText('打开标签预设'));
    await fireEvent.press(screen.getByLabelText('复制到预设 星星'));
    await waitFor(() => expect(onPresetsChange).toHaveBeenCalledWith(['爆发', '星星']));
  });
});

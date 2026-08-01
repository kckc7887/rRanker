import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { TagEditor } from '@/components/TagEditor';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GestureHandlerRootView: RN.View,
    Pressable: (props: React.ComponentProps<typeof RN.Pressable>) => React.createElement(
      RN.Pressable,
      { ...props, testID: props.testID ?? 'gesture-handler-pressable' },
    ),
  };
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

  it('uses the shared page-sheet chrome and grouped card style', async () => {
    const screen = await render(<TagEditor tags={[]} presets={['爆发']} historyTags={['星星']}
      onChange={jest.fn(async () => undefined)} onPresetsChange={jest.fn(async () => undefined)} />);

    await fireEvent.press(screen.getByLabelText('打开标签预设'));

    expect(StyleSheet.flatten(screen.getByTestId('tag-preset-sheet').props.style)).toEqual(
      expect.objectContaining({ flex: 1 }),
    );
    expect(StyleSheet.flatten(screen.getByTestId('tag-preset-sheet-grabber').props.style)).toEqual(
      expect.objectContaining({ width: 36, height: 5, marginTop: 8, marginBottom: 4 }),
    );
    expect(StyleSheet.flatten(screen.getByTestId('tag-preset-list').props.style)).toEqual(
      expect.objectContaining({ borderRadius: 14, overflow: 'hidden' }),
    );
    expect(StyleSheet.flatten(screen.getByLabelText('新预设标签').props.style)).toEqual(
      expect.objectContaining({ minHeight: 48, borderRadius: 12, fontSize: 17 }),
    );
    expect(StyleSheet.flatten(screen.getByLabelText('添加预设标签').props.style)).toEqual(
      expect.objectContaining({ minHeight: 48, borderRadius: 12 }),
    );
  });

  it('uses external presets as fixed choices without changing the preset collection', async () => {
    const onChange = jest.fn(async () => undefined);
    const onPresetsChange = jest.fn(async () => undefined);
    const screen = await render(<TagEditor tags={[]} presets={['错位', '高难']} historyTags={['旧标签']}
      presetsEditable={false} onChange={onChange} onPresetsChange={onPresetsChange} />);

    await fireEvent.press(screen.getByLabelText('打开标签预设'));
    expect(screen.getByLabelText('选择标签 错位').props.testID).toBe('gesture-handler-pressable');
    expect(screen.getByLabelText('完成标签选择').props.testID).toBe('gesture-handler-pressable');
    expect(screen.getByLabelText('选择标签 错位')).toBeTruthy();
    expect(screen.getByLabelText('选择标签 高难')).toBeTruthy();
    expect(screen.queryByLabelText('删除预设 错位')).toBeNull();
    expect(screen.queryByLabelText('上移预设 高难')).toBeNull();
    expect(screen.queryByLabelText('新预设标签')).toBeNull();
    expect(screen.queryByLabelText('添加预设标签')).toBeNull();
    expect(screen.queryByLabelText('复制到预设 旧标签')).toBeNull();

    await fireEvent.press(screen.getByLabelText('选择标签 高难'));
    await fireEvent.press(screen.getByLabelText('选择标签 旧标签'));
    await fireEvent.press(screen.getByLabelText('完成标签选择'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['高难', '旧标签']));
    expect(onPresetsChange).not.toHaveBeenCalled();
  });

  it('keeps the sheet open and shows the save error beside the choices', async () => {
    const screen = await render(<TagEditor tags={[]} presets={['错位']} presetsEditable={false}
      onChange={jest.fn(async () => { throw new Error('本地标签写入失败'); })} />);

    await fireEvent.press(screen.getByLabelText('打开标签预设'));
    await fireEvent.press(screen.getByLabelText('选择标签 错位'));
    expect(screen.getByLabelText('选择标签 错位').props.accessibilityState).toEqual({ checked: true });
    await fireEvent.press(screen.getByLabelText('完成标签选择'));

    await waitFor(() => expect(within(screen.getByTestId('tag-preset-message')).getByText('本地标签写入失败')).toBeTruthy());
    expect(screen.getByTestId('tag-preset-sheet')).toBeTruthy();
  });
});

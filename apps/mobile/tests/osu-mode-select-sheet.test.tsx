import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { OsuModeSelectContent } from '@/components/osu/OsuModeSelectContent';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    background: '#fff',
    surface: '#fff',
    surfaceMuted: '#f5f5f5',
    input: '#fff',
    border: '#ddd',
    text: '#111',
    textSecondary: '#444',
    textMuted: '#777',
    accent: '#246BFD',
  }),
}));

describe('OsuModeSelectContent 模式复选器', () => {
  it('展示四个模式，已绑定模式勾选且置灰', async () => {
    const onSubmit = jest.fn();
    const screen = await render(
      <OsuModeSelectContent alreadyBound={['osu-standard']} busy={false} submitLabel="绑定选中模式" onSubmit={onSubmit} />,
    );
    expect(screen.getByLabelText('osu!standard').props.accessibilityState).toEqual({ checked: true, disabled: true });
    expect(screen.getByLabelText('osu!mania').props.accessibilityState).toEqual({ checked: false, disabled: false });
    expect(screen.getByLabelText('osu!catch')).toBeTruthy();
    expect(screen.getByLabelText('osu!taiko')).toBeTruthy();
  });

  it('确认只提交本次新勾选的模式', async () => {
    const onSubmit = jest.fn();
    const screen = await render(
      <OsuModeSelectContent alreadyBound={['osu-standard']} busy={false} submitLabel="绑定选中模式" onSubmit={onSubmit} />,
    );
    fireEvent.press(screen.getByLabelText('osu!mania'));
    await waitFor(() => expect(screen.getByLabelText('osu!mania').props.accessibilityState.checked).toBe(true));
    fireEvent.press(screen.getByLabelText('绑定选中模式'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(['osu-mania']));
  });

  it('未选择新模式时确认按钮禁用', async () => {
    const onSubmit = jest.fn();
    const screen = await render(
      <OsuModeSelectContent alreadyBound={[]} busy={false} submitLabel="绑定选中模式" onSubmit={onSubmit} />,
    );
    expect(screen.getByLabelText('绑定选中模式').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByLabelText('绑定选中模式'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('已绑定模式点击无效', async () => {
    const onSubmit = jest.fn();
    const screen = await render(
      <OsuModeSelectContent alreadyBound={['osu-standard', 'osu-mania', 'osu-catch', 'osu-taiko']} busy={false} submitLabel="绑定选中模式" onSubmit={onSubmit} />,
    );
    fireEvent.press(screen.getByLabelText('osu!standard'));
    expect(screen.getByLabelText('osu!standard').props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText('绑定选中模式').props.accessibilityState.disabled).toBe(true);
  });
});

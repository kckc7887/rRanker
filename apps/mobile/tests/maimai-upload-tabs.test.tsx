import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { MaimaiUploadTabs } from '@rranker/game-maimai/components/MaimaiUploadTabs';

jest.mock('@rranker/sdk/theme/app-theme', () => ({
  useAppTheme: () => ({
    accent: '#246BFD',
    surface: '#FFFFFF',
    surfaceMuted: '#EEF2F7',
    border: '#D1D5DB',
    textSecondary: '#4B5563',
  }),
}));

describe('Maimai upload tabs', () => {
  it('switches among friend code, player QR, and sync guide pages', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <MaimaiUploadTabs syncGuideAvailable value="friend_code" disabled={false} onChange={onChange} />,
    );

    expect(screen.getByLabelText('切换到好友码页面').props.accessibilityState)
      .toEqual({ selected: true, disabled: false });
    expect(screen.getByLabelText('切换到玩家二维码页面').props.accessibilityState)
      .toEqual({ selected: false, disabled: false });
    expect(screen.getByLabelText('切换到同步引导页面').props.accessibilityState)
      .toEqual({ selected: false, disabled: false });

    await fireEvent.press(screen.getByLabelText('切换到玩家二维码页面'));
    expect(onChange).toHaveBeenCalledWith('qr');
    await fireEvent.press(screen.getByLabelText('切换到同步引导页面'));
    expect(onChange).toHaveBeenCalledWith('lxns_guide');
  });

  it('disables page switching while either page is busy', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <MaimaiUploadTabs syncGuideAvailable value="lxns_guide" disabled onChange={onChange} />,
    );

    await fireEvent.press(screen.getByLabelText('切换到好友码页面'));
    await fireEvent.press(screen.getByLabelText('切换到玩家二维码页面'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('切换到同步引导页面').props.accessibilityState)
      .toEqual({ selected: true, disabled: true });
  });
  it('keeps friend code and QR uploads available when the LXNS guide is unavailable', async () => {
    const onChange = jest.fn();
    const screen = await render(<MaimaiUploadTabs value="lxns_guide" syncGuideAvailable={false} disabled={false} onChange={onChange} />);
    expect(screen.queryByText('同步引导')).toBeNull();
    await fireEvent.press(screen.getByText('玩家二维码'));
    expect(onChange).toHaveBeenCalledWith('qr');
  });

});

import { act, renderHook } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Platform } from 'react-native';
import { useModalCloseAction, useModalDismissal } from '@/hooks/use-modal-close-action';

describe('modal close actions', () => {
  afterEach(() => jest.restoreAllMocks());

  it('runs the latest action only after dismissal and drops it on unmount', async () => {
    const setVisible = jest.fn();
    const first = jest.fn();
    const second = jest.fn();
    const hook = await renderHook(() => useModalCloseAction(setVisible));
    await act(() => {
      hook.result.current.close(first);
      hook.result.current.close(second);
    });
    expect(setVisible).toHaveBeenCalledWith(false);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    await act(() => hook.result.current.onDismiss());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    await act(() => hook.result.current.onDismiss());
    expect(second).toHaveBeenCalledTimes(1);
    await act(() => hook.result.current.close(first));
    const dismissed = hook.result.current.onDismiss;
    await hook.unmount();
    await act(() => dismissed());
    expect(first).not.toHaveBeenCalled();
  });

  it('waits for the native dismiss event on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const dismissed = jest.fn();
    const hook = await renderHook(({ visible }: { visible: boolean }) => useModalDismissal(visible, dismissed), {
      initialProps: { visible: true },
    });
    await hook.rerender({ visible: false });
    expect(dismissed).not.toHaveBeenCalled();
    await act(() => hook.result.current());
    expect(dismissed).toHaveBeenCalledTimes(1);
  });

  it('handles Android host removal without waiting for an unsupported native event', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const dismissed = jest.fn();
    const hook = await renderHook(({ visible }: { visible: boolean }) => useModalDismissal(visible, dismissed), {
      initialProps: { visible: false },
    });
    expect(dismissed).not.toHaveBeenCalled();
    await hook.rerender({ visible: true });
    await hook.rerender({ visible: false });
    expect(dismissed).toHaveBeenCalledTimes(1);
    await act(() => hook.result.current());
    expect(dismissed).toHaveBeenCalledTimes(1);
  });
});

import { jest } from '@jest/globals';
import type { ImageCrop } from '@/components/image-crop';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Image } from 'react-native';
import { ImageCropper } from '@/components/ImageCropper';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({ background: '#fff', text: '#111', textMuted: '#777', accent: '#36f', border: '#ddd', surface: '#fff' }) }));

afterEach(() => { cleanup(); jest.restoreAllMocks(); });

it('confirms the restored region, resets to centered cover, and cancels without committing', async () => {
  jest.spyOn(Image, 'getSize').mockImplementation(() => Promise.resolve({ width: 1200, height: 800 }));
  const confirm = jest.fn<(crop: ImageCrop) => void>(); const cancel = jest.fn();
  const crop = { x: 0.25, y: 0.25, width: 1 / 3, height: 0.5 };
  const screen = await render(<ImageCropper uri="file:///cover.png" initialCrop={crop} onConfirm={confirm} onCancel={cancel} />);
  await waitFor(() => expect(screen.queryByTestId('image-crop-frame')).not.toBeNull());
  await fireEvent.press(screen.getByText('确定'));
  expect(confirm.mock.calls[0][0].x).toBeCloseTo(crop.x);
  expect(confirm.mock.calls[0][0].width).toBeCloseTo(crop.width);
  await fireEvent.press(screen.getByText('重置'));
  await fireEvent.press(screen.getByText('确定'));
  expect(confirm.mock.calls[1][0]).toEqual({ x: 1 / 6, y: 0, width: 2 / 3, height: 1 });
  confirm.mockClear(); await fireEvent.press(screen.getByText('取消'));
  expect(cancel).toHaveBeenCalledTimes(1); expect(confirm).not.toHaveBeenCalled();
});

it('retries an unreadable image before permitting confirmation', async () => {
  jest.spyOn(Image, 'getSize').mockImplementationOnce(() => Promise.reject(new Error('unreadable'))).mockImplementation(() => Promise.resolve({ width: 600, height: 600 }));
  const confirm = jest.fn<(crop: ImageCrop) => void>();
  const screen = await render(<ImageCropper uri="file:///cover.png" onConfirm={confirm} onCancel={jest.fn()} />);
  await fireEvent.press(await screen.findByText('图片加载失败，点击重试'));
  await waitFor(() => expect(screen.queryByText('图片加载失败，点击重试')).toBeNull());
  await fireEvent.press(screen.getByText('确定'));
  expect(confirm).toHaveBeenCalledWith({ x: 0, y: 0, width: 1, height: 1 });
});

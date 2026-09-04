import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import {
  RemoteImage,
  RemoteImageActivityScope,
  RemoteImagePersistenceScope,
} from '@/components/RemoteImage';

const mockFind = jest.fn<() => Promise<unknown>>();
const mockCache = jest.fn<(_source: unknown, _options: unknown, signal?: AbortSignal) => Promise<unknown>>();
const mockInvalidate = jest.fn<() => Promise<void>>();

jest.mock('@/services/remote-image-cache', () => ({
  cacheCompressedRemoteImage: (...args: [unknown, unknown, AbortSignal?]) => mockCache(...args),
  findCompressedRemoteImage: () => mockFind(),
  invalidateCompressedRemoteImage: () => mockInvalidate(),
  normalizeRemoteImageSource: (source: string) => ({ source: { uri: source }, stableIdentity: source }),
  supportsCompressedRemoteImageCache: () => true,
}));

jest.mock('expo-image', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  function MockImage(props: React.ComponentProps<typeof RN.Image>) {
    return <RN.Image {...props} />;
  }
  Object.assign(MockImage, {
    clearDiskCache: () => true,
    loadAsync: async () => null,
  });
  return { Image: MockImage };
});

const remoteSource = 'https://example.test/cover.jpg';
const cachedResult = {
  cacheKey: 'cached-cover',
  fileUri: 'file:///cached.webp',
  source: { uri: 'file:///cached.webp' },
};

describe('RemoteImage 压缩垫图', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCache.mockResolvedValue(null);
    mockInvalidate.mockResolvedValue();
  });

  it('先显示本地压缩图，再以内存在线图替换且不重复创建缓存', async () => {
    mockFind.mockResolvedValue(cachedResult);
    const onDisplay = jest.fn();
    const screen = await render(
      <RemoteImage
        cacheProfile="thumbnail"
        gameId="maimai"
        onDisplay={onDisplay}
        source={remoteSource}
        testID="cover"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source));
    expect(screen.getByTestId('cover').props.cachePolicy).toBe('none');
    await fireEvent(screen.getByTestId('cover'), 'display');
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toBe(remoteSource));
    expect(screen.getByTestId('cover').props.cachePolicy).toBe('memory');
    await fireEvent(screen.getByTestId('cover'), 'display');
    await waitFor(() => expect(onDisplay).toHaveBeenCalledTimes(1));
    expect(mockCache).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('在线图显示成功后才创建压缩缓存', async () => {
    mockFind.mockResolvedValue(null);
    const screen = await render(
      <RemoteImage cacheProfile="thumbnail" gameId="maimai" source={remoteSource} testID="cover" />,
    );
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toBe(remoteSource));
    expect(mockCache).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId('cover'), 'display');
    await waitFor(() => expect(mockCache).toHaveBeenCalledWith(
      remoteSource,
      { gameId: 'maimai', profile: 'thumbnail' },
      expect.any(AbortSignal),
    ));
    await screen.unmount();
  });

  it('在线图失败时继续显示已有压缩图', async () => {
    mockFind.mockResolvedValue(cachedResult);
    const onError = jest.fn();
    const screen = await render(
      <RemoteImage cacheProfile="artwork" gameId="phigros" onError={onError} source={remoteSource} testID="cover" />,
    );
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source));
    await fireEvent(screen.getByTestId('cover'), 'display');
    await fireEvent(screen.getByTestId('cover'), 'error', {});
    expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source);
    expect(onError).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('没有压缩图时沿用调用方的失败回退', async () => {
    mockFind.mockResolvedValue(null);
    const onError = jest.fn();
    const screen = await render(
      <RemoteImage cacheProfile="thumbnail" gameId="maimai" onError={onError} source={remoteSource} testID="cover" />,
    );
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toBe(remoteSource));
    await fireEvent(screen.getByTestId('cover'), 'error', {});
    expect(onError).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it('失去可见资格时取消尚未完成的落盘任务', async () => {
    mockFind.mockResolvedValue(null);
    let taskSignal: AbortSignal | undefined;
    mockCache.mockImplementation((_source, _options, signal) => {
      taskSignal = signal;
      return new Promise(() => undefined);
    });
    const tree = (enabled: boolean) => (
      <RemoteImageActivityScope active>
        <RemoteImagePersistenceScope enabled={enabled}>
          <RemoteImage cacheProfile="thumbnail" gameId="maimai" source={remoteSource} testID="cover" />
        </RemoteImagePersistenceScope>
      </RemoteImageActivityScope>
    );
    const screen = await render(tree(true));
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toBe(remoteSource));
    await fireEvent(screen.getByTestId('cover'), 'display');
    await waitFor(() => expect(mockCache).toHaveBeenCalledTimes(1));
    expect(taskSignal?.aborted).toBe(false);
    await screen.rerender(tree(false));
    expect(taskSignal?.aborted).toBe(true);
    await screen.unmount();
  });

  it('失活时放下图片 source', async () => {
    mockFind.mockResolvedValue(cachedResult);
    const screen = await render(
      <RemoteImageActivityScope active={false}>
        <RemoteImage cacheProfile="thumbnail" gameId="maimai" source={remoteSource} testID="cover" />
      </RemoteImageActivityScope>,
    );
    expect(screen.getByTestId('cover').props.source).toBeNull();
    await screen.unmount();
  });
});

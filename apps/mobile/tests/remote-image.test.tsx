import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import {
  RemoteImage,
  RemoteImageActivityScope,
  RemoteImagePersistenceScope,
} from '@/components/RemoteImage';

const mockFind = jest.fn<() => Promise<unknown>>();
const mockCache = jest.fn<(_source: unknown, _options: unknown, signal?: AbortSignal) => Promise<unknown>>();
const mockAcquire = jest.fn<(_source: unknown, _gameId: string, signal?: AbortSignal) => Promise<{ fileUri: string; release: () => Promise<void> }>>();
const mockReleaseOriginal = jest.fn<() => Promise<void>>();
const mockInvalidate = jest.fn<() => Promise<void>>();

jest.mock('@/services/remote-image-cache', () => ({
  acquireRemoteImageOriginal: (...args: [unknown, string, AbortSignal?]) => mockAcquire(...args),
  cacheCompressedRemoteImage: (...args: [unknown, unknown, AbortSignal?]) => mockCache(...args),
  findCompressedRemoteImage: () => mockFind(),
  invalidateCompressedRemoteImage: () => mockInvalidate(),
  normalizeRemoteImageSource: jest.requireActual<typeof import('@/services/remote-image-cache')>(
    '@/services/remote-image-cache',
  ).normalizeRemoteImageSource,
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
const originalSource = { uri: 'file:///original.jpg' };
const cachedResult = {
  cacheKey: 'cached-cover',
  fileUri: 'file:///cached.webp',
  source: { uri: 'file:///cached.webp' },
};

describe('RemoteImage 压缩垫图', () => {
  it('starts the original without visibility and retains it across hidden tabs while preserving artwork props', async () => {
    mockFind.mockResolvedValue(null);
    const tree = (active: boolean) => <RemoteImageActivityScope active={active}>
      <RemoteImagePersistenceScope enabled={active}>
        <RemoteImage cacheProfile="artwork" gameId="maimai" source={remoteSource} testID="cover"
          blurRadius={12} style={{ opacity: 0.65 }} contentFit="cover" />
      </RemoteImagePersistenceScope>
    </RemoteImageActivityScope>;
    const screen = await render(tree(false));
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(originalSource));
    await fireEvent(screen.getByTestId('cover'), 'display');
    expect(mockCache).not.toHaveBeenCalled();
    expect(screen.getByTestId('cover').props).toMatchObject({ blurRadius: 12, style: { opacity: 0.65 }, contentFit: 'cover' });
    await screen.rerender(tree(true));
    await waitFor(() => expect(mockCache).toHaveBeenCalled());
    await screen.rerender(tree(false));
    expect(screen.getByTestId('cover').props.source).toEqual(originalSource);
    expect(mockReleaseOriginal).not.toHaveBeenCalled();
    await screen.unmount();
    expect(mockReleaseOriginal).toHaveBeenCalledTimes(1);
  });

  it('releases an obsolete original and never replaces the current source with a late result', async () => {
    mockFind.mockResolvedValue(null);
    const old = Promise.withResolvers<{ fileUri: string; release: () => Promise<void> }>();
    mockAcquire.mockReturnValueOnce(old.promise);
    const screen = await render(<RemoteImage cacheProfile="thumbnail" gameId="maimai" source={remoteSource} testID="cover" />);
    await waitFor(() => expect(mockAcquire).toHaveBeenCalled());
    const signal = mockAcquire.mock.calls[0][2];
    await screen.rerender(<RemoteImage cacheProfile="thumbnail" gameId="maimai" source="https://example.test/new.jpg" testID="cover" />);
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(originalSource));
    expect(signal?.aborted).toBe(true);
    const releaseOld = jest.fn<() => Promise<void>>().mockResolvedValue();
    old.resolve({ fileUri: 'file:///old.jpg', release: releaseOld });
    await waitFor(() => expect(releaseOld).toHaveBeenCalled());
    expect(screen.getByTestId('cover').props.source).toEqual(originalSource);
    await screen.unmount();
  });

  it('reports an original download failure without starting compression or another remote load', async () => {
    mockFind.mockResolvedValue(null);
    mockAcquire.mockRejectedValueOnce(new Error('HTTP 403'));
    const onError = jest.fn();
    const screen = await render(<RemoteImage cacheProfile="thumbnail" gameId="maimai" source={remoteSource} onError={onError} testID="cover" />);
    await waitFor(() => expect(onError).toHaveBeenCalledWith({ error: 'HTTP 403' }));
    expect(screen.getByTestId('cover').props.source).toBeNull();
    expect(mockCache).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('discards a corrupt compressed fallback and shares the replacement original with compression', async () => {
    mockFind.mockResolvedValue(cachedResult);
    const screen = await render(<RemoteImage cacheProfile="thumbnail" gameId="maimai" source={remoteSource} testID="cover" />);
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source));
    await fireEvent(screen.getByTestId('cover'), 'error', { error: 'decode failed' });
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(originalSource));
    expect(mockInvalidate).toHaveBeenCalled();
    await fireEvent(screen.getByTestId('cover'), 'display');
    await waitFor(() => expect(mockCache).toHaveBeenCalled());
    await screen.unmount();
  });

  it('等待空闲再落盘，离开可见区域时取消排队任务', async () => {
    const callbacks: (() => void)[] = [];
    const cancel = jest.fn();
    const originalIdle = globalThis.requestIdleCallback;
    const originalCancelIdle = globalThis.cancelIdleCallback;
    globalThis.requestIdleCallback = callback => {
      callbacks.push(() => callback({ didTimeout: false, timeRemaining: () => 4 }));
      return callbacks.length;
    };
    globalThis.cancelIdleCallback = cancel;
    mockFind.mockResolvedValue(null);
    const tree = (enabled: boolean) => <RemoteImagePersistenceScope enabled={enabled}>
      <RemoteImage cacheProfile="thumbnail" gameId="maimai" source={remoteSource} testID="cover" />
    </RemoteImagePersistenceScope>;
    try {
      const screen = await render(tree(true));
      await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(originalSource));
      await fireEvent(screen.getByTestId('cover'), 'display');
      expect(callbacks).toHaveLength(1);
      expect(mockCache).not.toHaveBeenCalled();
      await screen.rerender(tree(false));
      expect(cancel).toHaveBeenCalledTimes(1);
      callbacks[0]();
      expect(mockCache).not.toHaveBeenCalled();
      await screen.unmount();
    } finally {
      globalThis.requestIdleCallback = originalIdle;
      globalThis.cancelIdleCallback = originalCancelIdle;
    }
  });
  it('keeps an equal source object stable and rechecks changed headers or cache identity', async () => {
    mockFind.mockResolvedValue(cachedResult);
    const tree = (token = 'first', cacheKey = 'cover') => <RemoteImage cacheProfile="thumbnail" gameId="maimai" testID="cover"
      source={{ uri: remoteSource, headers: { Authorization: token }, cacheKey }} />;
    const screen = await render(tree());
    await waitFor(() => expect(mockFind).toHaveBeenCalledTimes(1));
    await screen.rerender(tree());
    expect(mockFind).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source);
    await screen.rerender(tree('second'));
    await waitFor(() => expect(mockFind).toHaveBeenCalledTimes(2));
    await screen.rerender(tree('second', 'other'));
    await waitFor(() => expect(mockFind).toHaveBeenCalledTimes(3));
    await screen.unmount();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockAcquire.mockReset().mockResolvedValue({ fileUri: originalSource.uri, release: mockReleaseOriginal });
    mockReleaseOriginal.mockReset().mockResolvedValue();
    mockCache.mockResolvedValue(null);
    mockInvalidate.mockResolvedValue();
  });

  it('直接显示包内图标，不查询或生成远程压缩缓存', async () => {
    const screen = await render(
      <RemoteImage cacheProfile="thumbnail" gameId="adofai" source={73} testID="bundled-icon" />,
    );
    expect(screen.getByTestId('bundled-icon').props.source).toBe(73);
    await fireEvent(screen.getByTestId('bundled-icon'), 'display');
    expect(mockFind).not.toHaveBeenCalled();
    expect(mockCache).not.toHaveBeenCalled();
    expect(mockInvalidate).not.toHaveBeenCalled();
    await screen.unmount();
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
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(originalSource));
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
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(originalSource));
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
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(originalSource));
    await fireEvent(screen.getByTestId('cover'), 'display');
    await waitFor(() => expect(mockCache).toHaveBeenCalledTimes(1));
    expect(taskSignal?.aborted).toBe(false);
    await screen.rerender(tree(false));
    expect(taskSignal?.aborted).toBe(true);
    await screen.unmount();
  });

  it('失活时保留已显示的图片且不启动新落盘', async () => {
    mockFind.mockResolvedValue(cachedResult);
    const tree = (active: boolean) => (
      <RemoteImageActivityScope active={active}>
        <RemoteImage cacheProfile="thumbnail" gameId="maimai" source={remoteSource} testID="cover" />
      </RemoteImageActivityScope>
    );
    const screen = await render(tree(true));
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source));
    mockFind.mockClear();
    mockCache.mockClear();
    await screen.rerender(tree(false));
    expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source);
    expect(mockFind).not.toHaveBeenCalled();
    expect(mockCache).not.toHaveBeenCalled();
    await screen.unmount();
  });
});

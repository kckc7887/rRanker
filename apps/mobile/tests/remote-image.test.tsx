import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { RemoteImageOriginal } from '@/services/remote-image-cache';
import { GameSongCover } from '@/components/game-content/GameSongCover';
import { GameSongRow } from '@/components/game-content/GameSongRow';
import {
  RemoteImage,
  RemoteImageActivityScope,
  RemoteImagePersistenceScope,
} from '@/components/RemoteImage';

const mockFind = jest.fn<(_source: unknown, _options: unknown, signal?: AbortSignal) => Promise<unknown>>();
const mockCache = jest.fn<(_source: unknown, _options: unknown, signal?: AbortSignal) => Promise<unknown>>();
const mockAcquire = jest.fn<(_source: unknown, _gameId: string, signal?: AbortSignal) => Promise<RemoteImageOriginal>>();
const mockReleaseOriginal = jest.fn<() => Promise<void>>();
const mockInvalidateOriginal = jest.fn<() => Promise<void>>();
const mockInvalidate = jest.fn<() => Promise<void>>();
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

jest.mock('@/services/remote-image-cache', () => ({
  acquireRemoteImageOriginal: (...args: [unknown, string, AbortSignal?]) => mockAcquire(...args),
  cacheCompressedRemoteImage: (...args: [unknown, unknown, AbortSignal?]) => mockCache(...args),
  findCompressedRemoteImage: (...args: [unknown, unknown, AbortSignal?]) => mockFind(...args),
  invalidateCompressedRemoteImage: () => mockInvalidate(),
  normalizeRemoteImageSource: jest.requireActual<typeof import('@/services/remote-image-cache')>(
    '@/services/remote-image-cache',
  ).normalizeRemoteImageSource,
  supportsCompressedRemoteImageCache: () => true,
}));

jest.mock('expo-image', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  function MockImage(props: React.ComponentProps<typeof RN.Image>) {
    const current = React.useRef(props);
    current.current = props;
    const onError = React.useCallback<NonNullable<typeof props.onError>>(
      (event) => current.current.onError?.(event), [],
    );
    return <RN.Image {...props} onError={onError} />;
  }
  Object.assign(MockImage, {
    clearDiskCache: () => true,
    loadAsync: async () => null,
  });
  return { Image: MockImage };
});

const remoteSource = 'https://example.test/cover.jpg';
const originalSource = { uri: 'file:///original.jpg', cacheKey: 'file:///original.jpg' };
const cachedResult = {
  cacheKey: 'cached-cover',
  fileUri: 'file:///cached.webp',
  source: { uri: 'file:///cached.webp' },
};

describe('歌曲封面来源更新', () => {
  it.each(['cover', 'row'] as const)('recovers %s after its failed source is replaced', async (kind) => {
    mockFind.mockResolvedValue(null);
    mockReleaseOriginal.mockResolvedValue(undefined);
    mockInvalidateOriginal.mockResolvedValue(undefined);
    mockAcquire.mockResolvedValue({ fileUri: 'file:///original.jpg', release: mockReleaseOriginal, invalidate: mockInvalidateOriginal });
    const content = (source: string) => kind === 'cover' ? <GameSongCover source={source} gameId="phigros" /> : <GameSongRow
      presentation={{ key: 'song', gameId: 'phigros', route: { songId: 'song', params: { gameId: 'phigros' } }, title: '歌曲', subtitle: '', accessibilityLabel: '打开歌曲', chartBadges: [] }}
      cover={null} badges={null} coverImage={{ source, accessibilityLabel: '歌曲封面', imageStyle: null, placeholderStyle: null, noteStyle: null }}
      rowStyle={null} mainStyle={null} titleStyle={null} subtitleStyle={null} />;
    const screen = await render(content('https://example.test/old.jpg'));
    await waitFor(() => expect(screen.getByLabelText('歌曲封面').props.source).not.toBeNull());
    const oldError = screen.getByLabelText('歌曲封面').props.onError as () => void;
    await fireEvent(screen.getByLabelText('歌曲封面'), 'error');
    expect(screen.queryByLabelText('歌曲封面')).toBeNull();
    await screen.rerender(content('https://example.test/new.jpg'));
    await waitFor(() => expect(screen.getByLabelText('歌曲封面').props.source).not.toBeNull());
    await act(async () => { oldError(); });
    expect(screen.getByLabelText('歌曲封面').props.source).not.toBeNull();
  });
});

describe('RemoteImage 压缩垫图', () => {
  it.each(['checking', 'cached', 'original'] as const)('keeps the replacement cover after a late native error during %s', async (phase) => {
    mockFind.mockResolvedValue(cachedResult);
    const screen = await render(<GameSongCover source={remoteSource} gameId="maimai" />);
    await waitFor(() => expect(screen.getByLabelText('歌曲封面').props.source).toEqual(cachedResult.source));
    const oldNativeError = screen.getByLabelText('歌曲封面').props.onError as (event: { error: string }) => void;
    const pending = Promise.withResolvers<unknown>();
    const replacement = { ...cachedResult, source: { uri: 'file:///replacement.webp' } };
    mockFind.mockReturnValueOnce(pending.promise);
    await screen.rerender(<GameSongCover source="https://example.test/replacement.jpg" gameId="maimai" />);
    expect(screen.getByLabelText('歌曲封面').props.source).toBeNull();
    if (phase === 'cached') await act(async () => { pending.resolve(replacement); });
    if (phase === 'original') {
      await act(async () => { pending.resolve(null); });
      await waitFor(() => expect(screen.getByLabelText('歌曲封面').props.source).toEqual(originalSource));
    }
    await act(async () => { oldNativeError({ error: 'late native decode failed' }); });
    if (phase === 'checking') await act(async () => { pending.resolve(replacement); });
    expect(screen.queryByText('♪')).toBeNull();
    expect(screen.getByLabelText('歌曲封面').props.source).toEqual(phase === 'original' ? originalSource : replacement.source);
    await screen.unmount();
  });

  it('ignores native events while the current image has no display source', async () => {
    const pending = Promise.withResolvers<unknown>();
    mockFind.mockReturnValueOnce(pending.promise);
    const screen = await render(<GameSongCover source={remoteSource} gameId="maimai" />);
    expect(screen.getByLabelText('歌曲封面').props.source).toBeNull();
    await fireEvent(screen.getByLabelText('歌曲封面'), 'display');
    await fireEvent(screen.getByLabelText('歌曲封面'), 'error', { error: 'late native decode failed' });
    await act(async () => { pending.resolve(cachedResult); });
    expect(screen.queryByText('♪')).toBeNull();
    expect(screen.getByLabelText('歌曲封面').props.source).toEqual(cachedResult.source);
    await screen.unmount();
  });

  it('cancels the previous lookup when switching covers and keeps the replacement visible', async () => {
    const pending = Promise.withResolvers<unknown>();
    let cancelled = false;
    mockFind.mockImplementationOnce((_source, _options, signal) => {
      signal?.addEventListener('abort', () => { cancelled = true; pending.resolve(null); }, { once: true });
      return pending.promise;
    }).mockResolvedValue(cachedResult);
    const screen = await render(<GameSongCover source={remoteSource} gameId="maimai" />);
    expect(screen.getByLabelText('歌曲封面').props.source).toBeNull();
    await screen.rerender(<GameSongCover source="https://example.test/replacement.jpg" gameId="maimai" />);
    await waitFor(() => expect(screen.getByLabelText('歌曲封面').props.source).toEqual(cachedResult.source));
    expect(cancelled).toBe(true);
    expect(screen.queryByText('♪')).toBeNull();
    await screen.unmount();
  });

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

  it('releases an obsolete original and never replaces the current cached source with a late result', async () => {
    mockFind.mockResolvedValue(cachedResult);
    const old = Promise.withResolvers<RemoteImageOriginal>();
    mockAcquire.mockReturnValueOnce(old.promise);
    const screen = await render(<RemoteImage cacheProfile="thumbnail" gameId="maimai" source={remoteSource} testID="cover" />);
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source));
    await fireEvent(screen.getByTestId('cover'), 'display');
    await waitFor(() => expect(mockAcquire).toHaveBeenCalled());
    const signal = mockAcquire.mock.calls[0][2];
    await screen.rerender(<RemoteImage cacheProfile="thumbnail" gameId="maimai" source="https://example.test/new.jpg" testID="cover" />);
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source));
    expect(signal?.aborted).toBe(true);
    const releaseOld = jest.fn<() => Promise<void>>().mockResolvedValue();
    old.resolve({ fileUri: 'file:///old.jpg', release: releaseOld, invalidate: mockInvalidateOriginal });
    await waitFor(() => expect(releaseOld).toHaveBeenCalled());
    expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source);
    await fireEvent(screen.getByTestId('cover'), 'display');
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(originalSource));
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
    await fireEvent(screen.getByTestId('cover'), 'display');
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual({
      ...originalSource, headers: { Authorization: 'second' },
    }));
    expect(mockAcquire).toHaveBeenCalledWith({
      uri: remoteSource, headers: { Authorization: 'second' }, cacheKey: 'other',
    }, 'maimai', expect.any(AbortSignal));
    await screen.unmount();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockAcquire.mockReset().mockResolvedValue({ fileUri: originalSource.uri,
      release: mockReleaseOriginal, invalidate: mockInvalidateOriginal });
    mockReleaseOriginal.mockReset().mockResolvedValue();
    mockInvalidateOriginal.mockReset().mockResolvedValue();
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

  it('等待原图期间和标签往返持续显示缓存，原图文件成功显示后只通知一次', async () => {
    mockFind.mockResolvedValue(cachedResult);
    const pending = Promise.withResolvers<RemoteImageOriginal>();
    mockAcquire.mockReturnValueOnce(pending.promise);
    const onDisplay = jest.fn();
    const tree = (active: boolean) => <RemoteImageActivityScope active={active}>
      <RemoteImage
        cacheProfile="thumbnail"
        gameId="maimai"
        onDisplay={onDisplay}
        source={remoteSource}
        testID="cover"
      />
    </RemoteImageActivityScope>;
    const screen = await render(tree(true));

    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source));
    expect(screen.getByTestId('cover').props.cachePolicy).toBe('none');
    await fireEvent(screen.getByTestId('cover'), 'display');
    await waitFor(() => expect(mockAcquire).toHaveBeenCalled());
    expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source);
    await screen.rerender(tree(false));
    expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source);
    await screen.rerender(tree(true));
    expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source);
    await fireEvent(screen.getByTestId('cover'), 'display');
    expect(onDisplay).not.toHaveBeenCalled();
    pending.resolve({ fileUri: originalSource.uri, release: mockReleaseOriginal, invalidate: mockInvalidateOriginal });
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(originalSource));
    expect(screen.getByTestId('cover').props.cachePolicy).toBe('memory');
    await fireEvent(screen.getByTestId('cover'), 'display');
    await fireEvent(screen.getByTestId('cover'), 'display');
    await waitFor(() => expect(onDisplay).toHaveBeenCalledTimes(1));
    expect(mockCache).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it.each(['thumbnail', 'artwork'] as const)('原图下载失败时 %s 缓存保持可见且不触发卡片失败回退', async cacheProfile => {
    mockFind.mockResolvedValue(cachedResult);
    const pending = Promise.withResolvers<RemoteImageOriginal>();
    mockAcquire.mockReturnValueOnce(pending.promise);
    const onError = jest.fn();
    const onDisplay = jest.fn();
    const tree = (active: boolean) => <RemoteImageActivityScope active={active}>
      <RemoteImage cacheProfile={cacheProfile} gameId="maimai" source={remoteSource}
        onError={onError} onDisplay={onDisplay} testID="cover" />
    </RemoteImageActivityScope>;
    const screen = await render(tree(true));
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source));
    await fireEvent(screen.getByTestId('cover'), 'display');
    await waitFor(() => expect(mockAcquire).toHaveBeenCalled());
    await act(async () => { pending.reject(new Error('offline')); });
    expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source);
    await screen.rerender(tree(false));
    await screen.rerender(tree(true));
    await fireEvent(screen.getByTestId('cover'), 'display');
    expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source);
    expect(onError).not.toHaveBeenCalled();
    expect(onDisplay).not.toHaveBeenCalled();
    expect(mockCache).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('等待原图期间缓存解码失败后不再把损坏缓存作为下载失败回退', async () => {
    mockFind.mockResolvedValue(cachedResult);
    const pending = Promise.withResolvers<RemoteImageOriginal>();
    mockAcquire.mockReturnValueOnce(pending.promise);
    const onError = jest.fn();
    const screen = await render(<RemoteImage cacheProfile="thumbnail" gameId="maimai"
      source={remoteSource} onError={onError} testID="cover" />);
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source));
    await fireEvent(screen.getByTestId('cover'), 'display');
    await waitFor(() => expect(mockAcquire).toHaveBeenCalled());
    await fireEvent(screen.getByTestId('cover'), 'error', { error: 'decode failed' });
    pending.reject(new Error('offline'));
    await waitFor(() => expect(onError).toHaveBeenCalledWith({ error: 'offline' }));
    expect(screen.getByTestId('cover').props.source).toBeNull();
    expect(mockInvalidate).toHaveBeenCalled();
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
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(originalSource));
    await fireEvent(screen.getByTestId('cover'), 'error', {});
    expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source);
    expect(mockInvalidateOriginal).toHaveBeenCalled();
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
    expect(mockInvalidateOriginal).toHaveBeenCalled();
    await screen.unmount();
  });

  it('旧图片的迟到解码失败不使当前图片失效', async () => {
    mockFind.mockResolvedValue(cachedResult);
    const screen = await render(<RemoteImage cacheProfile="artwork" gameId="maimai"
      source={remoteSource} testID="cover" />);
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source));
    await fireEvent(screen.getByTestId('cover'), 'display');
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(originalSource));
    const obsoleteFailure = screen.getByTestId('cover').props.onError;
    await screen.rerender(<RemoteImage cacheProfile="artwork" gameId="maimai"
      source="https://example.test/another.jpg" testID="cover" />);
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(cachedResult.source));
    await fireEvent(screen.getByTestId('cover'), 'display');
    await waitFor(() => expect(screen.getByTestId('cover').props.source).toEqual(originalSource));
    await act(async () => { obsoleteFailure({ error: 'late decode failure' }); });
    expect(mockInvalidateOriginal).not.toHaveBeenCalled();
    expect(screen.getByTestId('cover').props.source).toEqual(originalSource);
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

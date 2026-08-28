import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ image: Object.assign(() => null, { clearDiskCache: vi.fn() }) }));
vi.mock('expo-image', () => ({ Image: mocks.image }));

// expo-image mock 完成后导入，验证公共组件对真实能力组件设置内存默认值。
// eslint-disable-next-line import/first
import { RemoteImage } from '@/components/RemoteImage';

describe('RemoteImage', () => {
  it('forces every remote image onto memory-only cache policy', () => {
    const element = RemoteImage({ source: { uri: 'https://example.test/cover.png' } });
    expect(element.props.cachePolicy).toBe('memory');
    expect(element.props.source).toEqual({ uri: 'https://example.test/cover.png' });
  });

  it('still forces memory when the caller passes a disk policy', () => {
    const element = RemoteImage({ source: 'https://example.test/cover.png', cachePolicy: 'disk' });
    expect(element.props.cachePolicy).toBe('memory');
  });

  it('lets an explicit none policy through for one-off preview images', () => {
    const element = RemoteImage({ source: 'https://example.test/cover.png', cachePolicy: 'none' });
    expect(element.props.cachePolicy).toBe('none');
  });
});

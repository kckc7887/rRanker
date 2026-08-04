import { describe, expect, it } from 'vitest';
import { resolveChartPreviewAssetUri } from '@/features/maimai-chart-preview/chart-preview-asset-uri';

describe('resolveChartPreviewAssetUri', () => {
  it('将 Android drawable 资源标识符转换为可下载的绝对 URI', () => {
    expect(
      resolveChartPreviewAssetUri('assets_maimai_chart_preview_sensor', 'webp', 'android'),
    ).toEqual({
      uri: 'file:///android_res/drawable/assets_maimai_chart_preview_sensor.webp',
      requiresDownload: true,
    });
  });

  it.each(['file:///data/user/0/com.rranker.app/cache/sensor.webp', 'content://media/sensor'])(
    '保留已有的绝对 URI：%s',
    (uri) => {
      expect(resolveChartPreviewAssetUri(uri, 'webp', 'android')).toEqual({
        uri,
        requiresDownload: false,
      });
    },
  );

  it('将不带 scheme 的绝对文件路径转换为 file URI', () => {
    expect(
      resolveChartPreviewAssetUri(
        '/data/user/0/com.rranker.app/cache/sensor.webp',
        'webp',
        'android',
      ),
    ).toEqual({
      uri: 'file:///data/user/0/com.rranker.app/cache/sensor.webp',
      requiresDownload: false,
    });
  });

  it('拒绝非 Android 平台上的相对资源标识符', () => {
    expect(() =>
      resolveChartPreviewAssetUri('assets_maimai_chart_preview_sensor', 'webp', 'ios'),
    ).toThrow('谱面预览资源 URI 不是绝对地址');
  });
});

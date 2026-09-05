import {
  maimaiChartPreviewRuntimeSkinAssets,
  MAIMAI_CHART_PREVIEW_SKIN_DATA_GLOBAL,
} from '../../maimai-chart-preview-skin-files';
import { resolveSkinObject } from './skinSemantics';
import { EFFECT_SPRITES } from './effectSprites.generated';

const IMAGE_LOAD_CONCURRENCY = 4;

type SkinDataGlobal = Record<string, string>;

function readInjectedSkinDataUrls(): SkinDataGlobal {
  const injected = (globalThis as unknown as Record<string, unknown>)[MAIMAI_CHART_PREVIEW_SKIN_DATA_GLOBAL];
  if (!injected || typeof injected !== 'object') {
    throw new Error('皮肤数据未注入');
  }
  return injected as SkinDataGlobal;
}

export class ChartPreviewSkin {
  private readonly images = new Map<string, HTMLImageElement>();
  ready = false;

  get(path: string): HTMLImageElement | undefined {
    const image = this.images.get(resolveSkinObject(path));
    if (!image || !image.complete || image.naturalWidth === 0) return undefined;
    return image;
  }

  async load(): Promise<void> {
    const dataUrls = readInjectedSkinDataUrls();
    const assets = maimaiChartPreviewRuntimeSkinAssets();
    for (let index = 0; index < assets.length; index += IMAGE_LOAD_CONCURRENCY) {
      const batch = assets.slice(index, index + IMAGE_LOAD_CONCURRENCY);
      await Promise.all(batch.map((asset) => {
        const url = dataUrls[asset.path];
        if (!url) return Promise.reject(new Error(`皮肤缺失：${asset.path}`));
        return this.loadOne(url, asset.path, asset.width, asset.height);
      }));
    }
    await Promise.all(Object.entries(EFFECT_SPRITES).map(([name, sprite]) => this.loadOne(sprite.data, `ViewXEffects/${name}`, sprite.width, sprite.height)));
    this.ready = true;
  }

  private loadOne(url: string, path: string, width: number, height: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth !== width || image.naturalHeight !== height) {
          reject(new Error(`皮肤尺寸不符：${path}`));
          return;
        }
        this.images.set(path, image);
        resolve();
      };
      image.onerror = () => reject(new Error(`皮肤缺失：${path}`));
      image.src = url;
    });
  }
}

import type { StageContext, StageImages } from '../../../chart-preview-shared/webview-player/stage';
import {
  maimaiChartPreviewRuntimeSkinAssets,
  MAIMAI_CHART_PREVIEW_SKIN_DATA_GLOBAL,
  MAIMAI_CHART_PREVIEW_SENSOR,
} from '../../maimai-chart-preview-skin-files';
import { resolveSkinObject } from './skinSemantics';
import { EFFECT_SPRITES } from './effectSprites.generated';

type SkinDataGlobal = Record<string, string>;

function readInjectedSkinDataUrls(): SkinDataGlobal {
  const injected = (globalThis as unknown as Record<string, unknown>)[MAIMAI_CHART_PREVIEW_SKIN_DATA_GLOBAL];
  if (!injected || typeof injected !== 'object') {
    throw new Error('皮肤数据未注入');
  }
  return injected as SkinDataGlobal;
}

export class ChartPreviewSkin {
  private readonly images: StageImages;
  private urls: SkinDataGlobal = {};
  ready = false;

  constructor(stage: StageContext) {
    this.images = stage.createImages(path => this.urls[path]);
  }

  get(path: string): HTMLImageElement | undefined {
    return this.images.get(resolveSkinObject(path));
  }

  async load(): Promise<void> {
    this.ready = false;
    this.urls = { ...readInjectedSkinDataUrls() };
    for (const [name, sprite] of Object.entries(EFFECT_SPRITES)) this.urls[`ViewXEffects/${name}`] = sprite.data;
    const paths = [
      MAIMAI_CHART_PREVIEW_SENSOR.path,
      ...maimaiChartPreviewRuntimeSkinAssets().map(asset => asset.path),
      ...Object.keys(EFFECT_SPRITES).map(name => `ViewXEffects/${name}`),
    ];
    await Promise.all(paths.map(async path => {
      if (!await this.images.load(path)) throw new Error(`皮肤缺失：${path}`);
    }));
    this.ready = true;
  }
}

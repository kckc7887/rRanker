export {
  bestImageWebViewVersion,
  minimumBestImageHeight,
  parseBestImageErrorMessage,
  parseBestImageHeightMessage,
  parseBestImageReadyMessage,
  parseBestImageRuntimeMessage,
} from './best-image-messages';
export type { BestImageRuntimeMessage } from './best-image-messages';

export function bestImageBrandFooter(width: number): string {
  const unit = (value: number) => value * width / 1200;
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:${unit(6)}px;margin-top:${unit(18)}px;line-height:1.5">
    <img src="rranker-icon.png" width="${unit(64)}" height="${unit(64)}" style="display:block;border-radius:${unit(14)}px;margin-bottom:${unit(4)}px">
    <div style="font-size:${unit(18)}px">「音游日常，一站承包」</div>
    <div style="font-size:${unit(14)}px">rranker.com</div>
  </div>`;
}

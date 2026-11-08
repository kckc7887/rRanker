export {
  bestImageWebViewVersion,
  minimumBestImageHeight,
  parseBestImageErrorMessage,
  parseBestImageHeightMessage,
  parseBestImageReadyMessage,
  parseBestImageRuntimeMessage,
} from '@rranker/sdk/features/best-image/best-image-messages';
export type { BestImageRuntimeMessage } from '@rranker/sdk/features/best-image/best-image-messages';

export function bestImageBrandFooter(width: number): string {
  const unit = (value: number) => value * width / 1200;
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:${unit(6)}px;margin-top:${unit(18)}px;line-height:1.5">
    <img src="rranker-icon.png" width="${unit(64)}" height="${unit(64)}" style="display:block;border-radius:${unit(14)}px;margin-bottom:${unit(4)}px">
    <div style="font-size:${unit(18)}px">「音游日常，一站承包」</div>
    <div style="font-size:${unit(14)}px">rranker.com</div>
  </div>`;
}

export const bestImageTitleScript = `
function splitTitle(value, locale, measure, balance, kanjiPenalty = 0) {
  const words = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(locale, { granularity: 'word' }).segment(value), part => part.segment)
    : value.match(/[A-Za-z0-9]+|[^A-Za-z0-9]/gu) || [];
  let lines = [value], best = Infinity;
  for (let index = 1; index < words.length; index++) {
    const pair = [words.slice(0, index).join('').trim(), words.slice(index).join('').trim()];
    if (!pair[0] || !pair[1] || /^[!！?？、。，．)）ー]/u.test(pair[1]) || /[(（]$/u.test(pair[0])) continue;
    const widths = pair.map(measure);
    const cost = Math.max(...widths) + Math.abs(widths[0] - widths[1]) * balance
      + (/^[一-龥]$/u.test(words[index - 1]) ? kanjiPenalty : 0);
    if (cost < best) { best = cost; lines = pair; }
  }
  return lines;
}

function fitScoreTitles(selector, layout) {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return;
  document.querySelectorAll(selector).forEach(node => {
    const family = getComputedStyle(node).fontFamily;
    const measure = (text, size, weight = 700) => {
      context.font = weight + ' ' + size + 'px ' + family;
      return context.measureText(text).width;
    };
    const { lines, size, weight = 700, scale = 1, x, y, lineHeight } = layout(node.dataset.title || '', measure);
    node.setAttribute('font-size', String(size));
    node.setAttribute('font-weight', String(weight));
    if (scale !== 1) node.setAttribute('transform', 'translate(' + x + ' 0) scale(' + scale + ' 1)');
    else node.removeAttribute('transform');
    node.replaceChildren(...lines.map((line, index) => {
      const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      span.setAttribute('x', String(scale === 1 ? x : 0));
      span.setAttribute('y', String(y + index * lineHeight));
      span.textContent = line;
      return span;
    }));
  });
}

function fitTwoLineTitle(value, measure, { locale, width, wrapSize, singleSize, doubleSize, x, singleY, doubleY, lineHeight }) {
  const lines = measure(value, wrapSize) > width
    ? splitTitle(value, locale, line => measure(line, doubleSize), .18)
    : [value];
  const naturalWidth = Math.max(...lines.map(line => measure(line, 1)));
  const size = Math.min(lines.length === 1 ? singleSize : doubleSize, width / naturalWidth);
  return { lines, size, x, y: lines.length === 1 ? singleY : doubleY, lineHeight };
}
`;

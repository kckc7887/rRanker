// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeOsuChartPreviewSettings } from '@/features/osu-chart-preview/configuration';

function readPlayer(game: string): Document {
  return new DOMParser().parseFromString(readFileSync(
    resolve(process.cwd(), `src/features/${game}-chart-preview/webview-player/index.html`), 'utf8',
  ), 'text/html');
}

function cssRules(source: Document): Map<string, Record<string, string>> {
  const style = document.createElement('style');
  style.textContent = source.querySelector('style')!.textContent;
  document.head.append(style);
  try {
    const rules = new Map<string, Record<string, string>>();
    for (const rule of Array.from(style.sheet!.cssRules)) {
      if (!('selectorText' in rule)) continue;
      const { selectorText, style: declarations } = rule as CSSStyleRule;
      const values = rules.get(selectorText) ?? {};
      for (let index = 0; index < declarations.length; index++) {
        const property = declarations[index];
        values[property] = declarations.getPropertyValue(property).trim()
          + (declarations.getPropertyPriority(property) ? ' !important' : '');
      }
      rules.set(selectorText, values);
    }
    return rules;
  } finally {
    style.remove();
  }
}

type ElementShape = { tag: string; attributes: Record<string, string>; children: ElementShape[] };
function shape(element: Element, keepAttribute: (name: string) => boolean = () => true): ElementShape {
  return {
    tag: element.tagName,
    attributes: Object.fromEntries(Array.from(element.attributes)
      .filter(attribute => keepAttribute(attribute.name)).map(attribute => [attribute.name, attribute.value])),
    children: Array.from(element.children).map(child => shape(child, keepAttribute)),
  };
}

const osu = readPlayer('osu');
const phigros = readPlayer('phigros');

describe('osu! 谱面确认公共控制器外观合同', () => {
  it('走带、时间轴、拨轮、开关及全屏控制层沿用现有 Phigros 的 CSS 声明', () => {
    const actual = cssRules(osu);
    const reference = cssRules(phigros);
    const selectors = [...reference.keys()].filter(selector =>
      /#play-button|\.transport-|#time-label|[#.]timeline-|\.wheel|\.toggle|#fs-lock/u.test(selector)
      || ['#controls', '.row', '.row.wrap', '.field', 'button, label', 'button:disabled',
        'body.fullscreen #controls', 'body.fullscreen #controls.hidden',
        'body.fullscreen .controls-settings'].includes(selector));
    expect(selectors).toEqual(expect.arrayContaining([
      '#play-button', '.transport-group', '.transport-side', '.transport-btn',
      '#timeline-host', '#timeline-bars', '#timeline-ruler', '#timeline-playhead', '#timeline-badge',
      '.wheel-popup', '.wheel-item', '.toggle', '#fs-lock', 'body.fullscreen #controls',
    ]));
    for (const selector of selectors) expect(actual.get(selector), selector).toEqual(reference.get(selector));
    expect(actual.get(':root')!['--wheel-item-h']).toBe(reference.get(':root')!['--wheel-item-h']);
  });

  it('沿用相同走带图标和结构、密度时间轴结构及锁定按钮', () => {
    for (const selector of ['.transport-group', '#fs-lock']) {
      expect(shape(osu.querySelector(selector)!)).toEqual(shape(phigros.querySelector(selector)!));
    }
    // osu! 为时间轴补充可访问性属性，不改变现有密度条、刻度和游标的容器。
    expect(shape(osu.querySelector('#timeline-host')!, name => name === 'id'))
      .toEqual(shape(phigros.querySelector('#timeline-host')!, name => name === 'id'));
    const wheelShape = shape(phigros.querySelector('.wheel-field')!, name => ['class', 'style', 'type'].includes(name));
    for (const field of osu.querySelectorAll('.wheel-field')) {
      expect(shape(field, name => ['class', 'style', 'type'].includes(name))).toEqual(wheelShape);
    }
    for (const toggle of osu.querySelectorAll('.toggle')) {
      expect(shape(toggle, name => ['class', 'type'].includes(name)))
        .toEqual(shape(phigros.querySelector('.toggle')!, name => ['class', 'type'].includes(name)));
    }
    expect(osu.querySelector('input, select, details')).toBeNull();
  });

  it('普通和全屏播放窗均保持 16:9', () => {
    const rules = cssRules(osu);
    expect(rules.get('.stage')!['aspect-ratio']).toBe('16 / 9');
    expect(rules.get('body.fullscreen .stage')).toEqual(cssRules(phigros).get('body.fullscreen .stage'));
    expect(rules.get('body.fullscreen .stage')!['aspect-ratio']).toBe('16 / 9');
    const canvas = osu.querySelector('canvas')!;
    expect(Number(canvas.getAttribute('width')) / Number(canvas.getAttribute('height'))).toBe(16 / 9);
  });

  it.each([0, 1, 2, 3])('模式 %i 的设置初始标示与公共规范化配置一致', mode => {
    const defaults = normalizeOsuChartPreviewSettings(undefined);
    const labels = {
      'brightness-val': `${defaults.backgroundBrightness}%`,
      'blur-val': `${defaults.backgroundBlur} px`,
      'mania-skin-val': defaults.maniaSkin === 'circle' ? '圆圈' : '砖块',
      'scroll-speed-val': defaults.maniaScrollSpeed.toFixed(1),
      'hold-width-val': `${defaults.holdWidth}%`,
      'mania-track-opacity-val': `${defaults.maniaTrackOpacity}%`,
      'taiko-track-opacity-val': `${defaults.taikoTrackOpacity}%`,
    };
    const visibleFields = Array.from(osu.querySelectorAll<HTMLElement>('.wheel-field'))
      .filter(field => !field.dataset.mode || Number(field.dataset.mode) === mode);
    const expectedIds = ['brightness-val', 'blur-val', ...(mode === 3
      ? ['mania-skin-val', 'scroll-speed-val', 'hold-width-val', 'mania-track-opacity-val']
      : mode === 1 ? ['taiko-track-opacity-val'] : [])];
    expect(visibleFields.map(field => field.querySelector('.wheel-trigger span')!.id)).toEqual(expectedIds);
    for (const field of visibleFields) {
      const value = field.querySelector('.wheel-trigger span')!;
      expect(value.textContent, value.id).toBe(labels[value.id as keyof typeof labels]);
      expect(field.querySelector('button')!.disabled).toBe(true);
      expect(field.querySelector<HTMLElement>('.wheel-popup')!.style.visibility).toBe('hidden');
    }
    for (const [id, expected] of [
      ['storyboard-enabled', defaults.storyboardEnabled], ['video-enabled', defaults.videoEnabled],
      ['mania-ignore-sv', defaults.maniaIgnoreSV],
    ] as const) expect(osu.getElementById(id)!.getAttribute('aria-pressed'), id).toBe(String(expected));
    expect(osu.getElementById('mania-ignore-sv')!.dataset.mode).toBe('3');
    for (const field of osu.querySelectorAll('[data-mode]')) expect(field.hasAttribute('hidden')).toBe(true);
  });
});

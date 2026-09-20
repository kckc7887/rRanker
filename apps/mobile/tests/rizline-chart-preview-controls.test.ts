// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeRizlineChartPreviewSettings } from '@/features/rizline-chart-preview/configuration';

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
      .filter((attribute) => keepAttribute(attribute.name)).map((attribute) => [attribute.name, attribute.value])),
    children: Array.from(element.children).map((child) => shape(child, keepAttribute)),
  };
}

const rizline = readPlayer('rizline');
const phigros = readPlayer('phigros');

describe('Rizline 谱面确认公共控制器外观合同', () => {
  it('走带、时间轴、拨轮、开关及全屏控制层沿用现有 Phigros 的 CSS 声明', () => {
    const actual = cssRules(rizline);
    const reference = cssRules(phigros);
    const selectors = [...reference.keys()].filter((selector) =>
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
      expect(shape(rizline.querySelector(selector)!)).toEqual(shape(phigros.querySelector(selector)!));
    }
    expect(shape(rizline.querySelector('#timeline-host')!, (name) => name === 'id'))
      .toEqual(shape(phigros.querySelector('#timeline-host')!, (name) => name === 'id'));
    const wheelShape = shape(phigros.querySelector('.wheel-field')!, (name) => ['class', 'style', 'type'].includes(name));
    for (const field of rizline.querySelectorAll('.wheel-field')) {
      expect(shape(field, (name) => ['class', 'style', 'type'].includes(name))).toEqual(wheelShape);
    }
    for (const toggle of rizline.querySelectorAll('.toggle')) {
      expect(shape(toggle, (name) => ['class', 'type'].includes(name)))
        .toEqual(shape(phigros.querySelector('.toggle')!, (name) => ['class', 'type'].includes(name)));
    }
    expect(rizline.querySelector('input, select, details')).toBeNull();
  });

  it('普通和全屏舞台按剩余空间铺满，不锁 16:9', () => {
    const rules = cssRules(rizline);
    expect(rules.get('#stage-wrap')!.flex).toBe('1');
    expect(rules.get('.stage')!['aspect-ratio']).toBeUndefined();
    expect(rules.get('.stage')!.width).toBe('100%');
    expect(rules.get('.stage')!.height).toBe('100%');
    expect(rules.get('body.fullscreen .stage')).not.toEqual(cssRules(phigros).get('body.fullscreen .stage'));
    expect(rules.get('body.fullscreen .stage')!['aspect-ratio']).toBeUndefined();
    expect(rules.get('body.fullscreen .stage')!.width).toBe('100%');
    expect(rules.get('body.fullscreen .stage')!.height).toBe('100%');
  });

  it('设置初始标示与公共规范化配置一致', () => {
    const defaults = normalizeRizlineChartPreviewSettings(undefined);
    expect(rizline.getElementById('user-speed-val')!.textContent).toBe(defaults.userSpeed.toFixed(1));
    expect(rizline.getElementById('speed-val')!.textContent).toBe(`${defaults.playbackSpeed.toFixed(2)}×`);
    expect(rizline.getElementById('volume-val')!.textContent).toBe(`${Math.round(defaults.volume * 100)}%`);
    expect(rizline.getElementById('hit-sound-volume-val')!.textContent).toBe(`${Math.round(defaults.hitSoundVolume * 100)}%`);
    expect(rizline.getElementById('hit-sound')!.getAttribute('aria-pressed')).toBe(String(defaults.hitSound));
    expect(rizline.getElementById('line-color-trigger')).toBeNull();
    expect(rizline.getElementById('multi-hint')).toBeNull();
    expect(rizline.getElementById('dim-trigger')).toBeNull();
  });
});

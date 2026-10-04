import { hexToRgb, normalizeAccentHex } from '../../theme/accent-color';

export function chartPreviewAppearanceScript(appearance: { dark: boolean; accent: string }): string {
  const accent = normalizeAccentHex(appearance.accent) ?? '#5B8CFF';
  const luminance = (hex: string) => {
    const { r, g, b } = hexToRgb(hex)!;
    const values = [r, g, b].map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
  };
  const light = luminance(accent);
  const contrast = (other: number) => (Math.max(light, other) + 0.05) / (Math.min(light, other) + 0.05);
  const surfaces = appearance.dark ? ['#121212', '#1b1b1b', '#272727'] : ['#f5f5f5', '#ffffff', '#ededed'];
  const accentText = surfaces.every(color => contrast(luminance(color)) >= 4.5) ? accent : appearance.dark ? '#f1f1f1' : '#202020';
  const values = { '--preview-accent': accent, '--preview-on-accent': contrast(0) >= contrast(1) ? '#000000' : '#ffffff', '--preview-accent-text': accentText };
  return `(function(){var root=document.documentElement;root.dataset.theme=${JSON.stringify(appearance.dark ? 'dark' : 'light')};var values=${JSON.stringify(values)};Object.keys(values).forEach(function(key){root.style.setProperty(key,values[key]);});})();true;`;
}

type ChartPreviewInjectSpec<TConfig> = {

  globalVar: string;

  placeholder: string;

  serialize: (config: TConfig) => string;
};

type ChartPreviewInjectors<TConfig> = {
  buildInjectedJavaScript: (config: TConfig) => string;
  applyConfigToHtml: (html: string, config: TConfig) => string;
};

export function createChartPreviewInjectors<TConfig>(
  spec: ChartPreviewInjectSpec<TConfig>,
): ChartPreviewInjectors<TConfig> {
  const { globalVar, placeholder, serialize } = spec;
  const buildConfigJson = (config: TConfig): string => serialize(config).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const buildConfigScript = (config: TConfig): string =>
    `<script>window.${globalVar}=${buildConfigJson(config)};</script>`;
  const buildInjectedJavaScript = (config: TConfig): string =>
    `window.${globalVar}={...(window.${globalVar}||{}),...${buildConfigJson(config)}};true;`;
  const applyConfigToHtml = (html: string, config: TConfig): string => {
    const script = buildConfigScript(config);
    return html.replace(placeholder, () => script);
  };
  return { buildInjectedJavaScript, applyConfigToHtml };
}

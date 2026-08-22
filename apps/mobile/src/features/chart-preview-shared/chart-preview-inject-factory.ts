/**
 * 谱面确认 WebView 配置注入四件套泛型工厂（公共路径）：
 * 各游戏注入模块以全局变量名、HTML 占位注释与配置序列化器参数化，
 * 产出 config JSON、config script、injectedJavaScript 与 applyConfigToHtml，
 * 各游戏通过配置注入资源和主题。
 */

export type ChartPreviewInjectSpec<TConfig> = {
  /** WebView 内挂载配置的 window 全局变量名。 */
  globalVar: string;
  /** HTML 模板中的配置占位注释。 */
  placeholder: string;
  /** 配置对象转 JSON 字符串（字段顺序与默认值由各游戏定义）。 */
  serialize: (config: TConfig) => string;
};

export type ChartPreviewInjectors<TConfig> = {
  buildConfigJson: (config: TConfig) => string;
  buildConfigScript: (config: TConfig) => string;
  buildInjectedJavaScript: (config: TConfig) => string;
  applyConfigToHtml: (html: string, config: TConfig) => string;
};

export function createChartPreviewInjectors<TConfig>(
  spec: ChartPreviewInjectSpec<TConfig>,
): ChartPreviewInjectors<TConfig> {
  const { globalVar, placeholder, serialize } = spec;
  const buildConfigJson = (config: TConfig): string => serialize(config);
  const buildConfigScript = (config: TConfig): string =>
    `<script>window.${globalVar}=${buildConfigJson(config)};</script>`;
  const buildInjectedJavaScript = (config: TConfig): string =>
    `window.${globalVar}={...(window.${globalVar}||{}),...${buildConfigJson(config)}};true;`;
  const applyConfigToHtml = (html: string, config: TConfig): string => {
    const script = buildConfigScript(config);
    if (html.includes(placeholder)) {
      return html.replace(placeholder, script);
    }
    return script + html;
  };
  return { buildConfigJson, buildConfigScript, buildInjectedJavaScript, applyConfigToHtml };
}

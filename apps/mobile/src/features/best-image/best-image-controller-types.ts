import type { BestImageWebViewSource } from './prepare-best-image-webview-sources';

/** 成绩图屏幕的分页、偏好和导出控制器。 */
export type BestImageScreenControllerConfig<TType extends string, TPrefs> = {
  accountId: string;
  defaultType: TType;
  defaultWidth: number;
  defaultQuantityText: string;
  defaultPreferences: TPrefs;
  /** 偏好读写入口。 */
  preferences: {
    load: (accountId: string) => Promise<TPrefs>;
    save: (accountId: string, prefs: TPrefs) => Promise<void>;
  };
  /** 偏好 load 开始前的重置钩子（舞萌的随机选择去重集合清理）。 */
  onPreferencesLoadStart?: () => void;
  /** 导出默认高度：舞萌 minimumBestImageHeight(width)，中二/Phigros Math.ceil(width * 0.75)。 */
  defaultExportHeight: (width: number) => number;
  /** 高度/就绪消息的 DPR 基准；undefined 表示不传第三参（舞萌默认 4:3 最小高）。 */
  messageScale?: number;
  /** 导出逐页错误包装（舞萌「第 N/M 页渲染失败 / 保存失败」文案）。 */
  wrapExportPageError?: boolean;
  /** 导出忙态判定是否包含 exportIndex（舞萌），缺省仅看 exportStatus。 */
  exportBusyIncludesIndex?: boolean;
  /** 预览渲染消息是否走终态保护（舞萌 updateBestImageWebViewRenderingState 语义）。 */
  previewRenderingGuard?: boolean;
};

/** 每渲染传入的导出运行时输入（分页 / HTML / 页面源 / 前置条件 / 文件名）。 */
export type BestImageScreenControllerRuntime = {
  /** 当前分页结果（导出等待页高的查找表）。 */
  pages: readonly { id: string }[];
  /** 当前 HTML 页。 */
  htmlPages: readonly string[] | null;
  /** 导出使用的 WebView 页面源（中二为平台分支计算值，非 state）。 */
  sources: readonly BestImageWebViewSource[] | null;
  /** 导出前置条件（各游戏 payload/素材/表单校验，不含忙态与 sources 判空）。 */
  canExport: boolean;
  /** 导出文件名构造（bestImageExportFilename 的游戏参数封装）。 */
  buildExportFilename: (index: number, pageCount: number) => string;
};


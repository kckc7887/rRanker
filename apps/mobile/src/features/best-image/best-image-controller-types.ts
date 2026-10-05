import type { BestImageWebViewSource } from './prepare-best-image-webview-sources';

export type BestImageScreenControllerConfig<TType extends string, TPrefs> = {
  accountId: string;
  defaultType: TType;
  defaultWidth: number;
  defaultQuantityText: string;
  defaultPreferences: TPrefs;

  preferences: {
    load: (accountId: string) => Promise<TPrefs>;
    save: (accountId: string, prefs: TPrefs) => Promise<void>;
  };

  onPreferencesLoadStart?: () => void;

  defaultExportHeight: (width: number) => number;

  messageScale?: number;

  wrapExportPageError?: boolean;

  exportBusyIncludesIndex?: boolean;

  previewRenderingGuard?: boolean;
};

export type BestImageScreenControllerRuntime = {

  pages: readonly { id: string }[];

  htmlPages: readonly string[] | null;

  sources: readonly BestImageWebViewSource[] | null;

  canExport: boolean;

  buildExportFilename: (index: number, pageCount: number) => string;
};

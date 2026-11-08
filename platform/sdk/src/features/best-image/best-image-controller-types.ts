import type { BestImageGame } from '@rranker/sdk/features/best-image/load-best-image-session';
import type { BestImageWebViewSource } from '@rranker/sdk/features/best-image/prepare-best-image-webview-sources';

export type BestImageScreenControllerConfig<TType extends string, TPrefs extends object> = {
  pluginId: string;
  accountId: string;
  game: BestImageGame;
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

export type BestImageRatingStyle = 'game' | 'app';

import type { PreviewDifficulty } from './webview-player/heading';
export type PgrPreviewSettings = {
  playbackSpeed?: number;
  noteScale?: number;
  volume?: number;
  backgroundDim?: number;
  multiHint?: boolean;
  lineColor?: string;
  hitSoundVolume?: number;
  aspectRatio?: number | null;
  flipX?: boolean;
  effects?: boolean;
};

export type PgrPreviewRpeAssets = {
  /** 资源目录相对播放器 HTML，末尾须带 /。 */
  basePath: string;
  extraJson: string | null;
  infoYml: string | null;
  shaders: Record<string, string>;
};

export type PgrPreviewConfig = {
  game: string;
  sourceLabel?: string;
  title?: string;
  previewDifficulty?: PreviewDifficulty;
  chartUrl?: string;
  chartText?: string;
  musicUrl?: string;
  illustrationUrl?: string;
  hitSounds?: { click?: string; drag?: string; flick?: string };
  settings?: PgrPreviewSettings;

  format?: 'pgr' | 'rpe';
  rpeAssets?: PgrPreviewRpeAssets | null;

  theme?: 'light' | 'dark';
};

export type PreparedPgrPreviewInput = { config: PgrPreviewConfig; musicDataBase64?: string | null };

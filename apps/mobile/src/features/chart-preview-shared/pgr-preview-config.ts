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
  /** 相对播放器 HTML 的谱面包资源目录（判定线贴图/背景/gif/视频），以 / 结尾。 */
  basePath: string;
  extraJson: string | null;
  infoYml: string | null;
  shaders: Record<string, string>;
};

export type PgrPreviewConfig = {
  game: string;
  sourceLabel?: string;
  title?: string;
  chartUrl?: string;
  chartText?: string;
  musicUrl?: string;
  illustrationUrl?: string;
  hitSounds?: { click?: string; drag?: string; flick?: string };
  settings?: PgrPreviewSettings;
  /** 谱面格式：pgr（默认）或 rpe；RPE 时提供 rpeAssets。 */
  format?: 'pgr' | 'rpe';
  rpeAssets?: PgrPreviewRpeAssets | null;
  /** 播放器界面主题跟随应用，缺省为深色。 */
  theme?: 'light' | 'dark';
};

export type PreparedPgrPreviewInput = { config: PgrPreviewConfig; musicDataBase64?: string | null };

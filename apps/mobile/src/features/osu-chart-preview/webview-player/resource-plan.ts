import {
  assertChartPreviewNoteCount,
  type ChartPreviewCancellation,
} from '../../chart-preview-shared/chart-preview-resource-budget';
import { parseBeatmap } from './engine/parsers/BeatmapParser';
import { sampleLookupNames } from './engine-audio/hitsoundSchedule';
import { parseBeatmapVisuals, referencedImageFiles } from './events';
import { isOsbPath, normalizeArchivePath, resolveArchivePath } from './osu-text';

export type PreviewResourcePlan = {
  osbPaths: string[];
  imagePaths: string[];
  videoPath: string | null;
  audioPaths: string[];
};

const directory = (path: string): string => normalizeArchivePath(path).split('/').slice(0, -1).join('/').toLowerCase();

export function selectPreviewOsbPaths(osuPath: string, availablePaths: readonly string[]): string[] {
  const sourceDirectory = directory(osuPath);
  return availablePaths.filter(path => isOsbPath(path) && directory(path) === sourceDirectory)
    .sort((left, right) => left.localeCompare(right, 'en'));
}

/** Shares declared resource identities between native extraction and WebView decoding. */
export function selectPreviewResources(input: {
  osuText: string;
  osuPath: string;
  osbSources: readonly { path: string; text: string }[];
  availablePaths: readonly string[];
  includeVideo?: boolean;
  cancellation?: ChartPreviewCancellation;
}): PreviewResourcePlan {
  const available = new Map<string, string>();
  for (const path of input.availablePaths) {
    const normalized = normalizeArchivePath(path);
    if (normalized && !available.has(normalized.toLowerCase())) available.set(normalized.toLowerCase(), path);
  }
  const lookup = (name: string, source = ''): string | undefined => available.get(resolveArchivePath(name, source).toLowerCase());
  const osbPaths = selectPreviewOsbPaths(input.osuPath, input.availablePaths);
  const allowedOsb = new Set(osbPaths.map(path => normalizeArchivePath(path).toLowerCase()));
  const sources = input.osbSources.filter(source => allowedOsb.has(normalizeArchivePath(source.path).toLowerCase()))
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const visuals = parseBeatmapVisuals(input.osuText, sources.map(source => source.text), {
    osuPath: input.osuPath, osbPaths: sources.map(source => source.path), cancellation: input.cancellation,
  });
  const images = [...referencedImageFiles(visuals.objects), ...(visuals.background ? [visuals.background] : [])];
  const imagePaths = [...new Set(images.map(name => lookup(name)).filter((path): path is string => path !== undefined))];
  const beatmap = parseBeatmap(input.osuText);
  assertChartPreviewNoteCount(beatmap.hitObjects.length + beatmap.maniaHolds.length);
  const audio = new Set<string>();
  const addAudio = (name: string, source = input.osuPath): void => { const path = lookup(name, source); if (path) audio.add(path); };
  if (beatmap.audioFilename) addAudio(beatmap.audioFilename);
  for (const sample of visuals.samples) addAudio(sample.file, '');
  const indices = new Set([0, ...beatmap.timingPoints.map(point => point.sampleIndex)]);
  for (const object of [...beatmap.hitObjects, ...beatmap.maniaHolds]) {
    indices.add(object.hitSample.index);
    if (object.hitSample.filename) {
      for (const name of sampleLookupNames('normal', 1, 0, object.hitSample.filename, beatmap.mode)) addAudio(name);
    }
  }
  // The player resolves timing-point and slider-edge banks at each actual hit. Stage
  // only candidates used by this map's sample indices; decode only its final schedule.
  for (const index of indices) for (const bank of [1, 2, 3]) {
    for (const type of ['normal', 'whistle', 'finish', 'clap'] as const) {
      for (const name of sampleLookupNames(type, bank, index, '', beatmap.mode)) addAudio(name);
    }
  }
  for (const stem of ['combobreak', 'spinnerbonus']) for (const extension of ['wav', 'mp3', 'ogg']) addAudio(`${stem}.${extension}`);
  const videoPath = input.includeVideo === false || !visuals.video
    ? null
    : lookup(visuals.video.file) ?? null;
  return { osbPaths, imagePaths, videoPath, audioPaths: [...audio] };
}

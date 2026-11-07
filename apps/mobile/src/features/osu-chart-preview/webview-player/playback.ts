import {
  computeModDifficulty, Renderer,
  warmSkinCaches, drawCursor,
  type BeatmapData, type ReplayData, type ModDifficulty, type SkinAssets,
} from './engine';
import { AudioSync } from './engine-audio/AudioSync';
import { computeHitsoundSchedule, hitsoundEventsFromSchedule } from './engine-audio/hitsoundSchedule';
import { buildAutoReplay, parseOsuBytes } from './autoplay';
import { createPreviewMedia, type PreviewMedia } from './backdrop';
import { createBuiltinSkin } from './builtin-skin';
import { DEFAULT_MANIA_SKIN, parseManiaSkinVariant, type ManiaSkinVariant } from './mania-skin';
import { loadPreviewAudio } from './audio-assets';
import { resolvePlaybackRange, type PlaybackRange } from './playback-range';
import type { PreviewResourceMap } from './osu-text';
import type { OsuMode } from './modes';
import { MANIA_SCROLL_DEFAULT, clampManiaScrollSpeed } from './scroll-speed';
import { normalizePreviewSettings, type PreviewSettings } from './preview-settings';
export type PreviewChartEntry = { path: string; bytes: Uint8Array; hash: string; mode?: OsuMode };
export type PreviewInitialOptions = { settings?: Partial<PreviewSettings>; maniaSkin?: ManiaSkinVariant; maniaScrollSpeed?: number };

export type PlaybackHandle = { session: PreviewSession; durationMs: number; media: PreviewMedia };
let audioContext: AudioContext | null = null;
let active: PlaybackHandle | null = null;
let preparing: AbortController | null = null;

export function getAudioContext(): AudioContext {
  return audioContext ??= new AudioContext({ latencyHint: 'playback' });
}

function createRenderer(canvas: HTMLCanvasElement, beatmap: BeatmapData, replay: ReplayData, modDiff: ModDifficulty, skin: SkinAssets): Renderer {
  warmSkinCaches(skin);
  return new Renderer(canvas, replay, beatmap, skin, modDiff);
}

export class PreviewSession {
  get loop() { return this.audioSync.playback.loop; }
  get playing() { return this.audioSync.running; }
  get ended() { return this.audioSync.playback.ended; }
  disposed = false;
  onTransportFrame?: () => void;
  private skinRequest = 0;
  private mediaTime = 0;
  settings = normalizePreviewSettings({});
  private skinVariant: ManiaSkinVariant = DEFAULT_MANIA_SKIN;
  private renderedSkinVariant = this.skinVariant;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly beatmap: BeatmapData,
    readonly replay: ReplayData,
    readonly modDiff: ModDifficulty,
    public renderer: Renderer,
    readonly audioSync: AudioSync,
    readonly media: PreviewMedia,
    readonly range: PlaybackRange,
    readonly controller: AbortController,
    private skin: SkinAssets,
    initial: PreviewInitialOptions = {},
  ) {
    this.settings = normalizePreviewSettings(initial.settings);
    this.skinVariant = parseManiaSkinVariant(initial.maniaSkin);
    this.renderedSkinVariant = this.skinVariant;
    this.configureRenderer();
    this.renderer.options.maniaScrollSpeed = clampManiaScrollSpeed(initial.maniaScrollSpeed ?? MANIA_SCROLL_DEFAULT);
    this.audioSync.playback.onFrame = (seconds, jump) => {
      this.draw(jump, seconds * 1000);
      this.onTransportFrame?.();
    };
    this.draw(true);
  }

  private configureRenderer(): void {
    Object.assign(this.renderer.options, {
      showFollowpoints: true, maniaScrollSpeed: MANIA_SCROLL_DEFAULT,
      backdropOverlay: (ctx: CanvasRenderingContext2D) => this.media.drawUnder(ctx, this.mediaTime),
      hudOverlay: (ctx: CanvasRenderingContext2D, timeMs: number) => {
        this.media.drawOver(ctx, this.mediaTime);
        if (this.replay.mode === 0) drawCursor(ctx, this.replay, timeMs, this.skin);
      },
    });
    this.applySettings();
  }

  private applySettings(): void {
    this.media.configure(this.settings);
    this.audioSync.setSpeed(this.settings.playbackSpeed);
    this.audioSync.setStoryboardEnabled(this.settings.storyboardEnabled);
    Object.assign(this.renderer.options, {
      maniaIgnoreSV: this.settings.maniaIgnoreSV,
      maniaTrackOpacity: this.settings.maniaTrackOpacity / 100,
      taikoTrackOpacity: this.settings.taikoTrackOpacity / 100,
    });
  }

  async setSettings(partial: Partial<PreviewSettings>): Promise<void> {
    if (this.disposed) return;
    const previousWidth = this.settings.holdWidth;
    this.settings = normalizePreviewSettings({ ...this.settings, ...partial });
    this.applySettings();
    if (this.beatmap.mode === 3 && previousWidth !== this.settings.holdWidth) await this.refreshSkin();
    if (!this.playing) this.draw();
  }

  get currentTimeMs(): number {
    return Math.max(0, Math.min(this.range.durationMs, this.audioSync.outputTimeMs));
  }

  draw(forceSeek = false, presentationMs = this.currentTimeMs): void {
    if (this.disposed) return;
    this.mediaTime = this.range.startMs + presentationMs;
    this.media.sync(this.mediaTime, this.playing, forceSeek);
    this.renderer.renderFrameAt(this.mediaTime + this.renderer.options.audioOffsetMs - this.renderer.oldOffsetMs);
  }

  playFrom(presentationMs: number): Promise<void> { return this.audioSync.playFrom(presentationMs); }
  pause(): void { this.audioSync.pause(); }
  seek(presentationMs: number, playing = this.playing): Promise<void> {
    return this.audioSync.playback.seek(presentationMs / 1000, playing);
  }

  async setSkin(variant: ManiaSkinVariant): Promise<void> {
    if (this.beatmap.mode !== 3 || this.disposed) return;
    this.skinVariant = variant;
    await this.refreshSkin();
  }

  private async refreshSkin(): Promise<void> {
    const request = ++this.skinRequest;
    const variant = this.skinVariant;
    const builtin = await createBuiltinSkin(variant, Math.max(1, Math.round(this.beatmap.circleSize)), this.settings.holdWidth, 3);
    if (this.disposed || request !== this.skinRequest) return;
    if (variant === this.renderedSkinVariant) {

      for (const [name, bitmap] of builtin.images) if (/-body(?:@2x)?\.png$/.test(name)) this.skin.images.set(name, bitmap);
      if (!this.playing) this.draw();
      return;
    }
    const skin = { ...builtin, images: new Map(builtin.images) };
    this.renderer.setManiaSkin(skin);
    this.skin = skin;
    this.renderedSkinVariant = variant;
    if (!this.playing) this.draw();
  }

  destroy(): void {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    this.skinRequest++;
    this.controller.abort();
    this.audioSync.destroy();
    this.media.dispose();
    this.renderer.dispose();
  }
}

export function destroyPlayback(): void {
  preparing?.abort();
  preparing = null;
  active?.session.destroy();
  active = null;
}

export async function startPlayback(
  canvas: HTMLCanvasElement, files: { visuals: PreviewResourceMap; audio: ReadonlyMap<string, Uint8Array> }, entry: PreviewChartEntry,
  onWarning: (message: string) => void = () => {},
  initial: PreviewInitialOptions = {},
): Promise<PlaybackHandle> {
  destroyPlayback();
  const controller = new AbortController();
  preparing = controller;
  const signal = controller.signal;
  const warn = (message: string): void => { if (!signal.aborted) onWarning(message); };
  let media: PreviewMedia | null = null;
  let renderer: Renderer | null = null;
  let audio: AudioSync | null = null;
  let session: PreviewSession | null = null;
  try {
    const ctx = getAudioContext();
    signal.throwIfAborted();
    const beatmap = parseOsuBytes(entry.bytes);
    if (![0, 1, 2, 3].includes(beatmap.mode)) throw new Error('unsupported-mode');
    const keys = beatmap.mode === 3 ? Math.max(1, Math.round(beatmap.circleSize)) : 4;
    const [replay, builtin] = await Promise.all([
      buildAutoReplay(beatmap, entry.hash, signal),
      createBuiltinSkin(parseManiaSkinVariant(initial.maniaSkin), keys, normalizePreviewSettings(initial.settings).holdWidth, beatmap.mode),
    ]);
    const modDiff = computeModDifficulty(beatmap, replay);
    const skin = { ...builtin, images: new Map(builtin.images) };
    signal.throwIfAborted();
    renderer = createRenderer(canvas, beatmap, replay, modDiff, skin);
    const schedule = computeHitsoundSchedule({
      mode: beatmap.mode, beatmap, hitResults: renderer.hitResults,
      maniaSamples: renderer.maniaSamples, taikoGhostTaps: renderer.taikoGhostTaps,
      comboFrames: renderer.comboFrames, oldOffsetMs: renderer.oldOffsetMs, fromBeatmapMs: -Infinity,
    });
    media = await createPreviewMedia({
      files: files.visuals, osuBytes: entry.bytes, osuPath: entry.path, signal, onWarning: warn,
      storyboardEnabled: initial.settings?.storyboardEnabled,
      videoEnabled: initial.settings?.videoEnabled,
      onInvalidate: () => session?.draw(),
    });
    media.bindTriggers(hitsoundEventsFromSchedule(schedule));
    const decoded = await loadPreviewAudio({
      ctx, files: files.audio, osuPath: entry.path, songName: beatmap.audioFilename, mode: beatmap.mode,
      schedule, samples: media.visuals.samples, signal, onWarning: warn,
    });
    signal.throwIfAborted();
    const range = resolvePlaybackRange(beatmap, decoded.song ? decoded.song.duration * 1000 : null, media.range, decoded.endMs);
    audio = new AudioSync({
      ctx, songBuffer: decoded.song, skinSounds: skin.sounds, mergedSounds: decoded.sounds,
      beatmapHitsounds: true, introOffsetMs: range.startMs, durationSeconds: range.durationMs / 1000,
      mode: beatmap.mode, schedule, extraSamples: decoded.samples,
    });
    session = new PreviewSession(canvas, beatmap, replay, modDiff, renderer, audio, media, range, controller, skin, initial);
    const handle = { session, durationMs: range.durationMs, media };
    active = handle;
    if (preparing === controller) preparing = null;
    return handle;
  } catch (error) {
    controller.abort();
    audio?.destroy();
    media?.dispose();
    renderer?.dispose();
    if (preparing === controller) preparing = null;
    throw error;
  }
}

export function applyManiaScrollSpeed(session: PreviewSession, value: number): void {
  session.renderer.options.maniaScrollSpeed = clampManiaScrollSpeed(value);
  if (!session.playing) session.draw();
}
export async function playFrom(session: PreviewSession, presMs: number): Promise<void> { await session.playFrom(presMs); }
export function pausePlayback(session: PreviewSession): void { session.pause(); }
export async function seekPlayback(session: PreviewSession, presMs: number, playing: boolean): Promise<void> { await session.seek(presMs, playing); }
export function presentationTime(session: PreviewSession): number { return session.currentTimeMs; }

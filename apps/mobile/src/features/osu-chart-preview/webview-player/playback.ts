import {
  applyStacking, computeModDifficulty, Renderer, Player, TimeMapper, PlaybackClock,
  getAudioContextOutputTime, warmSkinCaches, warmSliderPaths, drawCursor,
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
export type PreviewChartEntry = { path: string; bytes: Uint8Array; hash: string; mode: OsuMode };
export type PreviewInitialOptions = { settings?: Partial<PreviewSettings>; maniaSkin?: ManiaSkinVariant; maniaScrollSpeed?: number };

export type PlaybackHandle = { session: PreviewSession; durationMs: number; media: PreviewMedia };
let audioContext: AudioContext | null = null;
let active: PlaybackHandle | null = null;
let preparing: AbortController | null = null;

export function getAudioContext(): AudioContext {
  return audioContext ??= new AudioContext();
}

function createRenderer(canvas: HTMLCanvasElement, beatmap: BeatmapData, replay: ReplayData, modDiff: ModDifficulty, skin: SkinAssets): Renderer {
  warmSkinCaches(skin);
  return new Renderer(canvas, new Player(1), replay, beatmap, createGameplaySkin(skin, replay.mode), new TimeMapper(replay.frames), null, modDiff);
}

export function createGameplaySkin(skin: SkinAssets, mode: number): SkinAssets {
  if (mode !== 0) return skin;
  const transparent = skin.images.get('hit300.png');
  if (!transparent || transparent.width <= 1 || transparent.height <= 1) throw new Error('无法准备播放画面');
  const images = new Map(skin.images);
  // A missing or 1x1 cursor triggers primitive fallback; this built-in 2x2 sentinel suppresses it.
  for (const stem of ['cursor', 'cursormiddle', 'cursortrail']) {
    images.set(`${stem}.png`, transparent);
    images.set(`${stem}@2x.png`, transparent);
  }
  return { ...skin, images };
}

export class PreviewSession {
  readonly clock = new PlaybackClock();
  playing = false;
  ended = false;
  disposed = false;
  private positionMs = 0;
  private frame: number | null = null;
  private command = 0;
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
    this.clock.setOffset(range.startMs / 1000);
    this.draw(true);
  }

  private configureRenderer(): void {
    Object.assign(this.renderer.options, {
      showJudgement: false, showKeyOverlay: false, showFollowpoints: true,
      showURBar: false, showModIcons: false, maniaScrollSpeed: MANIA_SCROLL_DEFAULT,
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
    if (!this.playing) return this.positionMs;
    const mapMs = this.clock.positionAt(getAudioContextOutputTime(getAudioContext())) * 1000;
    return Math.max(0, Math.min(this.range.durationMs, mapMs - this.range.startMs));
  }

  draw(forceSeek = false): void {
    if (this.disposed) return;
    this.mediaTime = this.range.startMs + this.currentTimeMs;
    this.media.sync(this.mediaTime, this.playing, forceSeek);
    this.renderer.renderFrameAt(this.mediaTime + this.renderer.options.audioOffsetMs - this.renderer.oldOffsetMs);
  }

  private tick = (): void => {
    this.frame = null;
    if (this.disposed || !this.playing) return;
    if (this.currentTimeMs >= this.range.durationMs) {
      this.pause();
      this.positionMs = this.range.durationMs;
      this.ended = true;
      this.clock.setOffset(this.range.endMs / 1000);
      this.draw(true);
      return;
    }
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  };

  async playFrom(presentationMs: number): Promise<void> {
    if (this.disposed) return;
    this.pause();
    const generation = ++this.command;
    this.positionMs = Math.max(0, Math.min(presentationMs, this.range.durationMs));
    if (this.positionMs >= this.range.durationMs) this.positionMs = 0;
    await this.audioSync.playFrom(this.positionMs);
    if (this.disposed || generation !== this.command) return;
    const ctx = getAudioContext();
    this.clock.set(ctx.currentTime, (this.range.startMs + this.audioSync.currentTimeMs) / 1000, 1);
    this.playing = true;
    this.ended = false;
    this.draw(true);
    this.frame = requestAnimationFrame(this.tick);
  }

  pause(): void {
    this.command++;
    this.positionMs = this.currentTimeMs;
    this.playing = false;
    this.audioSync.pause();
    this.clock.setOffset((this.range.startMs + this.positionMs) / 1000);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.media.sync(this.range.startMs + this.positionMs, false, true);
  }

  async seek(presentationMs: number, playing = this.playing): Promise<void> {
    if (this.disposed) return;
    this.pause();
    this.positionMs = Math.max(0, Math.min(presentationMs, this.range.durationMs));
    this.ended = this.positionMs >= this.range.durationMs;
    this.clock.setOffset((this.range.startMs + this.positionMs) / 1000);
    this.draw(true);
    if (playing && !this.ended) await this.playFrom(this.positionMs);
  }

  async setSkin(variant: ManiaSkinVariant): Promise<void> {
    if (this.beatmap.mode !== 3 || this.disposed) return;
    this.skinVariant = variant;
    await this.refreshSkin();
  }

  private async refreshSkin(): Promise<void> {
    const request = ++this.skinRequest;
    const variant = this.skinVariant;
    const builtin = await createBuiltinSkin(variant, Math.max(1, Math.round(this.beatmap.circleSize)), this.settings.holdWidth);
    if (this.disposed || request !== this.skinRequest) return;
    if (variant === this.renderedSkinVariant) {
      // Sessions own their image map. Width changes replace only three tiny body textures;
      // the ruleset and its judgement/scroll indexes stay alive while dragging the control.
      for (const [name, bitmap] of builtin.images) if (/-body(?:@2x)?\.png$/.test(name)) this.skin.images.set(name, bitmap);
      if (!this.playing) this.draw();
      return;
    }
    const skin = { ...builtin, images: new Map(builtin.images) };
    const previousOptions = { ...this.renderer.options };
    const next = createRenderer(this.canvas, this.beatmap, this.replay, this.modDiff, skin);
    this.renderer.stop();
    this.renderer = next;
    this.skin = skin;
    this.renderedSkinVariant = variant;
    Object.assign(next.options, previousOptions);
    if (!this.playing) this.draw();
  }

  destroy(): void {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    this.skinRequest++;
    this.controller.abort();
    this.renderer.stop();
    this.audioSync.destroy();
    this.media.dispose();
  }
}

export function destroyPlayback(): void {
  preparing?.abort();
  preparing = null;
  active?.session.destroy();
  active = null;
}

export async function startPlayback(
  canvas: HTMLCanvasElement, files: PreviewResourceMap, entry: PreviewChartEntry,
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
    beatmap.rawOsu = entry.bytes;
    const replay = buildAutoReplay(entry.bytes, entry.hash);
    const modDiff = computeModDifficulty(beatmap, replay);
    if (beatmap.mode === 0) applyStacking(beatmap, modDiff);
    warmSliderPaths(beatmap);
    const builtin = await createBuiltinSkin(parseManiaSkinVariant(initial.maniaSkin), beatmap.mode === 3 ? Math.max(1, Math.round(beatmap.circleSize)) : 4, normalizePreviewSettings(initial.settings).holdWidth);
    const skin = { ...builtin, images: new Map(builtin.images) };
    signal.throwIfAborted();
    renderer = createRenderer(canvas, beatmap, replay, modDiff, skin);
    const schedule = computeHitsoundSchedule({
      mode: entry.mode, beatmap, hitResults: renderer.hitResults,
      maniaSamples: renderer.maniaSamples, taikoGhostTaps: renderer.taikoGhostTaps,
      comboFrames: renderer.comboFrames, oldOffsetMs: renderer.oldOffsetMs, fromBeatmapMs: -Infinity,
    });
    media = await createPreviewMedia({
      files, osuBytes: entry.bytes, osuPath: entry.path, signal, onWarning: warn,
      onInvalidate: () => session?.draw(),
    });
    media.bindTriggers(hitsoundEventsFromSchedule(schedule));
    const decoded = await loadPreviewAudio({
      ctx, files, osuPath: entry.path, songName: beatmap.audioFilename, mode: entry.mode,
      schedule, samples: media.visuals.samples, signal, onWarning: warn,
    });
    signal.throwIfAborted();
    const range = resolvePlaybackRange(beatmap, decoded.song ? decoded.song.duration * 1000 : null, media.range, decoded.endMs);
    audio = new AudioSync({
      ctx, beatmap, songBuffer: decoded.song, skinSounds: skin.sounds, mergedSounds: decoded.sounds,
      beatmapHitsounds: true, hitResults: renderer.hitResults, introOffsetMs: range.startMs,
      mode: entry.mode, schedule, extraSamples: decoded.samples,
      maniaSamples: renderer.maniaSamples, taikoGhostTaps: renderer.taikoGhostTaps, comboFrames: renderer.comboFrames,
    });
    session = new PreviewSession(canvas, beatmap, replay, modDiff, renderer, audio, media, range, controller, skin, initial);
    const handle = { session, durationMs: range.durationMs, media };
    active = handle;
    if (preparing === controller) preparing = null;
    return handle;
  } catch (error) {
    controller.abort();
    renderer?.stop();
    audio?.destroy();
    media?.dispose();
    if (preparing === controller) preparing = null;
    throw error;
  }
}

export function applyManiaScrollSpeed(session: PreviewSession, value: number): void {
  session.renderer.options.maniaScrollSpeed = clampManiaScrollSpeed(value);
  if (!session.playing) session.draw();
}
export async function playFrom(session: PreviewSession, presMs: number): Promise<void> { await session.playFrom(presMs); }
export function pausePlayback(session: PreviewSession): void { session.pause(); session.draw(); }
export async function seekPlayback(session: PreviewSession, presMs: number, playing: boolean): Promise<void> { await session.seek(presMs, playing); }
export function presentationTime(session: PreviewSession): number { return session.currentTimeMs; }

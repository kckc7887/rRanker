/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
import type {BpmEvent, Chart, DivisorEvent} from '../../types';

function floorIndex(values: readonly number[], value: number): number {
  let left = 0, right = values.length;
  while (left < right) {
    const middle = left + Math.floor((right - left) / 2);
    if (values[middle]! > value) right = middle;
    else left = middle + 1;
  }
  return left - 1;
}

/** Piecewise affine conversion. Each breakpoint owns the interval to its right. */
export class TimingTimeline {
  private readonly beats: number[] = [];
  private readonly milliseconds: number[] = [];
  private readonly tempos: number[] = [];
  private readonly divisions: DivisorEvent[];
  private readonly divisionBeats: number[];

  constructor(private readonly defaultBpm: number, bpmEvents?: readonly BpmEvent[] | null,
    divisorEvents?: readonly DivisorEvent[] | null) {
    if (!(defaultBpm > 0) || !Number.isFinite(defaultBpm)) throw new Error('Invalid BPM');
    let beat = 0, elapsed = 0, bpm = defaultBpm;
    for (const event of [...(bpmEvents ?? [])].sort((a,b) => a.timing - b.timing)) {
      if (!(event.bpm > 0) || !Number.isFinite(event.bpm) || !Number.isFinite(event.timing))
        throw new Error('Invalid BPM event');
      elapsed += (event.timing - beat) * 60000 / bpm;
      this.beats.push(event.timing);
      this.milliseconds.push(elapsed);
      this.tempos.push(event.bpm);
      beat = event.timing;
      bpm = event.bpm;
    }
    this.divisions = [...(divisorEvents ?? [])].sort((a,b) => a.timing - b.timing);
    this.divisionBeats = this.divisions.map(event => event.timing);
  }
  static fromChart(chart: Chart): TimingTimeline {
    return new TimingTimeline(chart.bpm, chart.bpmEvents, chart.divisorEvents);
  }
  msFromBeat(beat: number): number {
    const i = floorIndex(this.beats, beat);
    return i < 0 ? beat * 60000 / this.defaultBpm
      : this.milliseconds[i]! + (beat - this.beats[i]!) * 60000 / this.tempos[i]!;
  }
  beatFromMs(ms: number): number {
    const i = floorIndex(this.milliseconds, ms);
    return i < 0 ? ms * this.defaultBpm / 60000
      : this.beats[i]! + (ms - this.milliseconds[i]!) * this.tempos[i]! / 60000;
  }
  bpmAtBeat(beat: number): number {
    return this.tempos[floorIndex(this.beats, beat)] ?? this.defaultBpm;
  }
  divisorAtBeat(beat: number): number {
    const event = this.divisions[floorIndex(this.divisionBeats, beat)];
    if (!event) return 4;
    return event.spec?.mode === 'seconds-compat' && event.spec.seconds !== undefined
      ? 240 / (this.bpmAtBeat(beat) * event.spec.seconds) : event.divisor;
  }
  chartMsFromScoreBeat(beat: number): number {return this.msFromBeat(beat + 4);}
  scoreBeatFromChartMs(ms: number): number {return this.beatFromMs(ms) - 4;}
  audioMsFromScoreBeat(beat: number, firstMs = 0): number {
    return this.chartMsFromScoreBeat(beat) - this.msFromBeat(4) + firstMs;
  }
  scoreBeatFromAudioMs(ms: number, firstMs = 0): number {
    return this.scoreBeatFromChartMs(ms + this.msFromBeat(4) - firstMs);
  }
}

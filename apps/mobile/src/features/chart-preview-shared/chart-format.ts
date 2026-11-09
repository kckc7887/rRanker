export type JsonChartFormat = 'pgr' | 'rpe' | 'rizline';

export function chartJsonFormat(value: unknown): JsonChartFormat | null {
  if (value === null || typeof value !== 'object') return null;
  const chart = value as Record<string, unknown>;
  if (Array.isArray(chart.judgeLineList)) {
    const meta = chart.META;
    if (Array.isArray(chart.BPMList) || (meta && typeof meta === 'object' && 'RPEVersion' in meta)) return 'rpe';
    if ((typeof chart.formatVersion === 'number' || typeof chart.formatVersion === 'string')
      && Number.isFinite(Number(chart.formatVersion))) return 'pgr';
    if ((meta && typeof meta === 'object') || chart.judgeLineList.some(line => line
      && (Array.isArray(line.eventLayers) || Array.isArray(line.notes)))) return 'rpe';
  }
  if (Array.isArray(chart.canvasMoves) && Array.isArray(chart.lines) && Array.isArray(chart.themes)) return 'rizline';
  return null;
}

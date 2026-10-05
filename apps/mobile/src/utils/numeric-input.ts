export function normalizeNumericInput(value: string): string {
  return value.normalize('NFKC').trim().replace(',', '.');
}

export function parseNumericInput(value: string): number {
  const normalized = normalizeNumericInput(value);
  return normalized ? Number(normalized) : Number.NaN;
}

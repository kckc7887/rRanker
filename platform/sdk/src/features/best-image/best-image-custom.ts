export function parseBestImageQuantity(value: string): number | null {
  const normalized = value.normalize('NFKC').trim();
  if (!/^\d+$/u.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

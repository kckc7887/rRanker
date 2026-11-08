export function parseConstantBound(input: string): number | undefined {
  const text = input.trim();
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function matchesConstantRange(constant: number, minInput: string, maxInput: string): boolean {
  const min = parseConstantBound(minInput);
  const max = parseConstantBound(maxInput);
  if (min !== undefined && constant < min) return false;
  if (max !== undefined && constant > max) return false;
  return true;
}

export function parseAchievementBound(input: string): number | undefined {
  const text = input.trim();
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= 101 ? value : undefined;
}

export function matchesAchievementRange(achievement: number, minInput: string, maxInput: string): boolean {
  const min = parseAchievementBound(minInput);
  const max = parseAchievementBound(maxInput);
  if (min !== undefined && max !== undefined && min > max) return false;
  if (min !== undefined && achievement < min) return false;
  if (max !== undefined && achievement > max) return false;
  return true;
}

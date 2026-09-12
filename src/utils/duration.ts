const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Parses a jsonwebtoken-style duration string (e.g. "8h", "30m", "1d") into milliseconds. */
export function parseDurationMs(value: string, fallbackMs = 8 * 60 * 60 * 1000): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(value.trim());
  if (!match) return fallbackMs;
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit];
}

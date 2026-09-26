export function nowMs(): number {
  return Date.now();
}

/**
 * UTC ISO-8601 timestamp in the same shape Python's `datetime.isoformat()`
 * produced (`2026-01-01T00:00:00.123000+00:00`), so documents written by the
 * previous backend and this one sort and compare consistently in MongoDB.
 */
export function toIso(date: Date): string {
  return date.toISOString().replace("Z", "000+00:00");
}

export function nowIso(): string {
  return toIso(new Date());
}

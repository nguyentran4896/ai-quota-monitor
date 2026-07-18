export function safeIsoFromEpochSeconds(value: number | null): string | null {
  if (value === null) return null;
  const milliseconds = value * 1_000;
  if (!Number.isFinite(milliseconds)) return null;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

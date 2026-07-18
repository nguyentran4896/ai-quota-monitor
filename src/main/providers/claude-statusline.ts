import { readFile } from "node:fs/promises";
import path from "node:path";
import type { QuotaWindow } from "../../shared/contracts";

export const CLAUDE_QUOTA_SNAPSHOT_FILE = "quotadeck-quota.json";

interface StoredClaudeWindow {
  usedPercent?: unknown;
  resetsAt?: unknown;
}

interface StoredClaudeSnapshot {
  schemaVersion?: unknown;
  observedAt?: unknown;
  cliVersion?: unknown;
  rateLimits?: {
    fiveHour?: StoredClaudeWindow;
    sevenDay?: StoredClaudeWindow;
  };
}

export interface ClaudeQuotaSnapshot {
  observedAt: string;
  cliVersion: string | null;
  quotaWindows: QuotaWindow[];
}

function normalizeWindow(
  id: string,
  label: string,
  windowMinutes: number,
  value: StoredClaudeWindow | undefined,
): QuotaWindow | null {
  if (!value || typeof value.usedPercent !== "number" || !Number.isFinite(value.usedPercent)) return null;
  const resetsAt = typeof value.resetsAt === "number" && Number.isFinite(value.resetsAt) ? value.resetsAt : null;
  return {
    id,
    label,
    windowMinutes,
    usedPercent: Math.max(0, Math.min(100, value.usedPercent)),
    resetsAt: resetsAt === null ? null : new Date(resetsAt * 1_000).toISOString(),
  };
}

export function parseClaudeQuotaSnapshot(raw: string): ClaudeQuotaSnapshot {
  const stored = JSON.parse(raw.replace(/^\uFEFF/, "")) as StoredClaudeSnapshot;
  if (stored.schemaVersion !== 1 || typeof stored.observedAt !== "string") {
    throw new Error("Unsupported Claude quota snapshot schema.");
  }
  const observedAt = new Date(stored.observedAt);
  if (!Number.isFinite(observedAt.getTime())) throw new Error("Invalid Claude quota observation time.");

  const quotaWindows = [
    normalizeWindow("five-hour", "5-hour window", 300, stored.rateLimits?.fiveHour),
    normalizeWindow("seven-day", "7-day window", 10_080, stored.rateLimits?.sevenDay),
  ].filter((window): window is QuotaWindow => window !== null);

  return {
    observedAt: observedAt.toISOString(),
    cliVersion: typeof stored.cliVersion === "string" ? stored.cliVersion : null,
    quotaWindows,
  };
}

export async function readClaudeQuotaSnapshot(configRoot: string): Promise<ClaudeQuotaSnapshot | null> {
  try {
    return parseClaudeQuotaSnapshot(await readFile(path.join(configRoot, CLAUDE_QUOTA_SNAPSHOT_FILE), "utf8"));
  } catch {
    return null;
  }
}

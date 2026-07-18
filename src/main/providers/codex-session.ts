import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { AccountSnapshot, QuotaWindow } from "../../shared/contracts";

const MAX_LOG_BYTES = 1_500_000;
const MAX_CANDIDATES = 24;

interface CodexRateWindow {
  used_percent?: unknown;
  window_minutes?: unknown;
  resets_at?: unknown;
}

interface CodexRateLimits {
  limit_id?: unknown;
  primary?: CodexRateWindow | null;
  secondary?: CodexRateWindow | null;
  plan_type?: unknown;
  rate_limit_reached_type?: unknown;
}

interface FileCandidate {
  filePath: string;
  modifiedMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatWindowLabel(minutes: number): string {
  if (minutes % 10_080 === 0) return `${minutes / 10_080}-week window`;
  if (minutes % 1_440 === 0) return `${minutes / 1_440}-day window`;
  if (minutes % 60 === 0) return `${minutes / 60}-hour window`;
  return `${minutes}-minute window`;
}

function toQuotaWindow(
  id: string,
  value: CodexRateWindow | null | undefined,
): QuotaWindow | null {
  if (!value) return null;
  const usedPercent = asFiniteNumber(value.used_percent);
  const windowMinutes = asFiniteNumber(value.window_minutes);
  const resetsAtSeconds = asFiniteNumber(value.resets_at);
  if (usedPercent === null || windowMinutes === null) return null;

  return {
    id,
    label: formatWindowLabel(windowMinutes),
    usedPercent: Math.max(0, Math.min(100, usedPercent)),
    windowMinutes,
    resetsAt:
      resetsAtSeconds === null
        ? null
        : new Date(resetsAtSeconds * 1_000).toISOString(),
  };
}

export function extractLatestRateLimits(jsonl: string): CodexRateLimits | null {
  const lines = jsonl.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (!line || !line.includes("rate_limits")) continue;

    try {
      const event = JSON.parse(line) as unknown;
      if (!isRecord(event) || !isRecord(event.payload)) continue;
      const rateLimits = event.payload.rate_limits;
      if (isRecord(rateLimits)) return rateLimits as CodexRateLimits;
    } catch {
      // A partially-written last line is normal while Codex is running.
    }
  }
  return null;
}

async function readTail(filePath: string): Promise<string> {
  const file = await open(filePath, "r");
  try {
    const details = await file.stat();
    const bytesToRead = Math.min(details.size, MAX_LOG_BYTES);
    const buffer = Buffer.alloc(bytesToRead);
    await file.read(buffer, 0, bytesToRead, details.size - bytesToRead);
    return buffer.toString("utf8");
  } finally {
    await file.close();
  }
}

async function findRecentJsonlFiles(root: string): Promise<FileCandidate[]> {
  const candidates: FileCandidate[] = [];

  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await visit(entryPath);
          return;
        }
        if (!entry.isFile() || !entry.name.endsWith(".jsonl")) return;
        try {
          const details = await stat(entryPath);
          candidates.push({ filePath: entryPath, modifiedMs: details.mtimeMs });
        } catch {
          // The file may disappear between directory enumeration and stat.
        }
      }),
    );
  }

  await visit(root);
  return candidates
    .sort((a, b) => b.modifiedMs - a.modifiedMs)
    .slice(0, MAX_CANDIDATES);
}

export async function collectCodexSnapshot(
  codexHome: string,
  options: { id?: string; displayName?: string; isManaged?: boolean } = {},
): Promise<AccountSnapshot> {
  const observedAt = new Date().toISOString();
  const id = options.id ?? "codex-current";
  const displayName = options.displayName ?? "Current Codex";
  const isManaged = options.isManaged ?? false;
  const candidates = await findRecentJsonlFiles(
    path.join(codexHome, "sessions"),
  );

  for (const candidate of candidates) {
    const rateLimits = extractLatestRateLimits(
      await readTail(candidate.filePath),
    );
    if (!rateLimits) continue;

    const quotaWindows = [
      toQuotaWindow("primary", rateLimits.primary),
      toQuotaWindow("secondary", rateLimits.secondary),
    ].filter((window): window is QuotaWindow => window !== null);
    const highestUsage = quotaWindows.reduce(
      (max, window) => Math.max(max, window.usedPercent),
      0,
    );

    return {
      id,
      provider: "codex",
      displayName,
      plan:
        typeof rateLimits.plan_type === "string" ? rateLimits.plan_type : null,
      state:
        rateLimits.rate_limit_reached_type || highestUsage >= 100
          ? "limited"
          : "ready",
      isActive: !isManaged,
      isManaged,
      quotaWindows,
      source: {
        label: "Latest local Codex session",
        confidence: "provider-reported",
        observedAt: new Date(candidate.modifiedMs).toISOString(),
      },
      notice: quotaWindows.length
        ? "Updated when Codex records a session event. It is not a live billing API."
        : "Codex is connected, but no quota window was present in the latest session event.",
    };
  }

  return {
    id,
    provider: "codex",
    displayName,
    plan: null,
    state: "unknown",
    isActive: !isManaged,
    isManaged,
    quotaWindows: [],
    source: {
      label: "No local Codex quota event",
      confidence: "unavailable",
      observedAt,
    },
    notice:
      "Use Codex once, then refresh. Quota snapshots appear only after a session records them.",
  };
}

import { createHmac } from "node:crypto";
import type {
  AuthenticationMode,
  BillingMode,
  QuotaStatus,
  QuotaWindow,
} from "../../shared/contracts";

export const SNAPSHOT_STALE_AFTER_MS = 15 * 60 * 1_000;

export function maskAccountIdentity(value: unknown): string | null {
  const normalized = normalizeAccountIdentity(value);
  if (!normalized) return null;

  const separator = normalized.lastIndexOf("@");
  if (separator > 0 && separator < normalized.length - 1) {
    const local = normalized.slice(0, separator);
    const domain = normalized.slice(separator + 1);
    return `${local.slice(0, 1)}***@${domain}`;
  }

  if (normalized.length <= 2) return `${normalized.slice(0, 1)}***`;
  return `${normalized.slice(0, 2)}***${normalized.slice(-1)}`;
}

function normalizeAccountIdentity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 254 ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function createIdentityVerifier(
  value: unknown,
  key: Uint8Array | undefined,
): string | null {
  const normalized = normalizeAccountIdentity(value);
  if (!normalized || !key?.length) return null;
  return createHmac("sha256", key)
    .update(normalized.toLocaleLowerCase("en-US"), "utf8")
    .digest("hex");
}

export function classifyQuotaStatus(options: {
  authMode: AuthenticationMode;
  billingMode: BillingMode;
  windows: QuotaWindow[];
  observedAt: string;
  evaluatedAt?: string;
  needsFirstResponse?: boolean;
  partial?: boolean;
}): QuotaStatus {
  if (options.authMode === "signed-out") return "signed-out";
  if (options.needsFirstResponse && options.windows.length === 0)
    return "needs-first-response";
  if (options.billingMode !== "subscription") return "unavailable";
  if (options.windows.length === 0) return "partial";

  const evaluatedAt = new Date(options.evaluatedAt ?? Date.now()).getTime();
  const observationTime = new Date(options.observedAt).getTime();
  const resetPassed = options.windows.some((window) => {
    if (!window.resetsAt) return false;
    const resetTime = new Date(window.resetsAt).getTime();
    return Number.isFinite(resetTime) && resetTime <= evaluatedAt;
  });
  if (resetPassed) return "awaiting-refresh";
  if (options.partial) return "partial";
  if (
    !Number.isFinite(observationTime) ||
    evaluatedAt - observationTime > SNAPSHOT_STALE_AFTER_MS
  ) {
    return "stale";
  }
  return "fresh";
}

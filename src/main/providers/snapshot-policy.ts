import { createHmac } from "node:crypto";
import type {
  AuthenticationMode,
  BillingMode,
  ManagedProfileLifecycle,
  ProviderErrorReason,
  QuotaStatus,
  QuotaWindow,
} from "../../shared/contracts";

export const SNAPSHOT_STALE_AFTER_MS = 15 * 60 * 1_000;

/**
 * Derives the explicit managed-profile lifecycle from the persisted
 * verification history (`verifiedIdentityVerifier`) and the live snapshot.
 * A profile that has never been verified is always guided to setup, so a
 * brand-new managed profile — even one whose CLI probe failed — surfaces
 * "Set up this account" instead of a launch that will only be blocked.
 */
export function deriveLifecycle(input: {
  isManaged: boolean;
  authMode: AuthenticationMode;
  identity: string | null;
  identityVerifier: string | null;
  verifiedIdentityVerifier: string | null;
  providerError: ProviderErrorReason | null;
}): ManagedProfileLifecycle {
  const everVerified = Boolean(input.verifiedIdentityVerifier);
  const setupOrError = (): ManagedProfileLifecycle =>
    input.isManaged && !everVerified ? "pending-login" : "provider-error";

  // The provider CLI could not be read, or ran but reported an auth mode we do
  // not understand. Either way we cannot confirm the account.
  if (input.providerError !== null || input.authMode === "unknown") {
    return setupOrError();
  }
  if (input.authMode === "signed-out") {
    return input.isManaged && !everVerified ? "pending-login" : "signed-out";
  }
  // Signed in with a recognized mode. Current (unmanaged) profiles never need
  // the managed identity-confirmation gate.
  if (!input.isManaged) return "verified";
  if (!input.identity || !input.identityVerifier) {
    return "authenticated-unverified";
  }
  return input.identityVerifier === input.verifiedIdentityVerifier
    ? "verified"
    : "authenticated-unverified";
}

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

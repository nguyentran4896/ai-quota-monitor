import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AuthenticationMode, BillingMode } from "../../shared/contracts";
import { createProfileEnvironment } from "../profiles/profile-environment";
import {
  readClaudeQuotaSnapshot,
  type ClaudeQuotaSnapshot,
} from "./claude-statusline";
import type { ProviderAccountSnapshot } from "./provider-snapshot";
import {
  classifyQuotaStatus,
  createIdentityVerifier,
  maskAccountIdentity,
} from "./snapshot-policy";

const execFileAsync = promisify(execFile);

export interface ClaudeAuthStatus {
  loggedIn?: unknown;
  email?: unknown;
  subscriptionType?: unknown;
  authMethod?: unknown;
  apiProvider?: unknown;
}

export function parseClaudeAuthStatus(raw: string): ClaudeAuthStatus {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Claude auth status was not an object");
  }
  return parsed as ClaudeAuthStatus;
}

export interface ClaudeSnapshotOptions {
  id?: string;
  displayName?: string;
  configRoot?: string | null;
  quotaRoot?: string | null;
  isManaged?: boolean;
  verifiedIdentity?: string | null;
  verifiedIdentityVerifier?: string | null;
  identityKey?: Uint8Array;
  command?: string;
}

export function describeClaudeNotice(
  loggedIn: boolean,
  hasQuotaWindows: boolean,
): string {
  if (!loggedIn)
    return "Sign in with Claude Code before this profile can be monitored.";
  if (hasQuotaWindows) {
    return "Last observed through Claude's official status-line event after a response. Additional weekly limits may apply.";
  }
  return "Connected. Launch this profile and complete one Claude response to capture its official quota windows.";
}

function describeClaudeAuthModes(auth: ClaudeAuthStatus): {
  authMode: AuthenticationMode;
  billingMode: BillingMode;
} {
  if (auth.loggedIn !== true) {
    return { authMode: "signed-out", billingMode: "unknown" };
  }
  if (typeof auth.subscriptionType === "string") {
    return { authMode: "subscription", billingMode: "subscription" };
  }

  const method =
    typeof auth.authMethod === "string" ? auth.authMethod.toLowerCase() : "";
  const provider =
    typeof auth.apiProvider === "string" ? auth.apiProvider.toLowerCase() : "";
  if (method.includes("claude.ai") || method.includes("oauth")) {
    return { authMode: "subscription", billingMode: "subscription" };
  }
  if (method.includes("api")) {
    return { authMode: "api-key", billingMode: "api" };
  }
  if (
    ["bedrock", "vertex", "foundry"].some(
      (candidate) => method.includes(candidate) || provider.includes(candidate),
    )
  ) {
    return { authMode: "external-provider", billingMode: "external" };
  }
  return { authMode: "unknown", billingMode: "unknown" };
}

export function mapClaudeSnapshot(
  auth: ClaudeAuthStatus,
  quota: ClaudeQuotaSnapshot | null,
  options: {
    id: string;
    displayName: string;
    isManaged: boolean;
    verifiedIdentity?: string | null;
    verifiedIdentityVerifier?: string | null;
    identityKey?: Uint8Array;
    observedAt: string;
    evaluatedAt?: string;
  },
): ProviderAccountSnapshot {
  const loggedIn = auth.loggedIn === true;
  const quotaWindows = quota?.quotaWindows ?? [];
  const quotaLimited = quotaWindows.some((window) => window.usedPercent >= 100);
  const sourceObservedAt = quota?.observedAt ?? options.observedAt;
  const { authMode, billingMode } = describeClaudeAuthModes(auth);

  const identity = maskAccountIdentity(auth.email);
  const identityVerifier = createIdentityVerifier(
    auth.email,
    options.identityKey,
  );
  return {
    id: options.id,
    provider: "claude",
    displayName: options.displayName,
    identity,
    identityVerifier,
    identityVerified:
      !options.isManaged ||
      (identityVerifier !== null &&
        identityVerifier === options.verifiedIdentityVerifier),
    plan:
      typeof auth.subscriptionType === "string" ? auth.subscriptionType : null,
    authMode,
    billingMode,
    quotaStatus: classifyQuotaStatus({
      authMode,
      billingMode,
      windows: quotaWindows,
      observedAt: sourceObservedAt,
      evaluatedAt: options.evaluatedAt,
      needsFirstResponse: loggedIn && billingMode === "subscription",
      partial: quotaWindows.length === 1,
    }),
    state: loggedIn ? (quotaLimited ? "limited" : "ready") : "signed-out",
    isActive: !options.isManaged,
    isManaged: options.isManaged,
    quotaWindows,
    source:
      quota && quotaWindows.length
        ? {
            label: "Claude status-line",
            confidence: "provider-reported",
            observedAt: quota.observedAt,
          }
        : {
            label: "Claude auth status",
            confidence: "local-observation",
            observedAt: options.observedAt,
          },
    notice: describeClaudeNotice(loggedIn, quotaWindows.length > 0),
  };
}

export async function collectClaudeSnapshot(
  options: ClaudeSnapshotOptions = {},
): Promise<ProviderAccountSnapshot> {
  const observedAt = new Date().toISOString();
  const id = options.id ?? "claude-current";
  const displayName = options.displayName ?? "Current Claude";
  const isManaged = options.isManaged ?? false;
  const environment = createProfileEnvironment(
    "claude",
    options.configRoot ?? null,
  );

  try {
    const { stdout } = await execFileAsync(
      options.command ?? "claude",
      ["auth", "status", "--json"],
      {
        timeout: 8_000,
        windowsHide: true,
        maxBuffer: 128_000,
        env: environment,
      },
    );
    const auth = parseClaudeAuthStatus(stdout);
    const quotaRoot = options.quotaRoot ?? options.configRoot;
    const quota = quotaRoot ? await readClaudeQuotaSnapshot(quotaRoot) : null;
    return mapClaudeSnapshot(auth, quota, {
      id,
      displayName,
      isManaged,
      verifiedIdentity: options.verifiedIdentity,
      verifiedIdentityVerifier: options.verifiedIdentityVerifier,
      identityKey: options.identityKey,
      observedAt,
    });
  } catch {
    return {
      id,
      provider: "claude",
      displayName,
      identity: null,
      identityVerifier: null,
      identityVerified: !isManaged,
      plan: null,
      authMode: "unknown",
      billingMode: "unknown",
      quotaStatus: "unavailable",
      state: "unknown",
      isActive: !isManaged,
      isManaged,
      quotaWindows: [],
      source: {
        label: "Claude CLI unavailable",
        confidence: "unavailable",
        observedAt,
      },
      notice: "QuotaDeck could not read `claude auth status`.",
    };
  }
}

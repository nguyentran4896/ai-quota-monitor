import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AuthenticationMode,
  BillingMode,
  ProviderErrorReason,
} from "../../shared/contracts";
import { createProfileEnvironment } from "../profiles/profile-environment";
import { resolveCliInvocation } from "../settings/resolve-cli-command";
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

export type ClaudeAuthReadResult =
  | { ok: true; auth: ClaudeAuthStatus }
  | { ok: false; reason: ProviderErrorReason };

function bufferToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return "";
}

/**
 * Classifies a rejected `claude auth status` invocation into a distinct
 * outcome. The official CLI exits non-zero when signed out, so any parseable
 * JSON is honored first, then spawn failures (missing/timeout) are split from a
 * clean non-zero exit, which is treated as an authoritative signed-out result.
 */
export function classifyClaudeAuthError(failure: {
  code?: string | number | null;
  killed?: boolean;
  signal?: NodeJS.Signals | null;
  stdout?: unknown;
}): ClaudeAuthReadResult {
  const emitted = bufferToString(failure.stdout).trim();
  if (emitted) {
    try {
      return { ok: true, auth: parseClaudeAuthStatus(emitted) };
    } catch {
      /* fall through to classification below */
    }
  }
  if (failure.code === "ENOENT") return { ok: false, reason: "cli-missing" };
  if (failure.killed || failure.signal === "SIGTERM") {
    return { ok: false, reason: "cli-timeout" };
  }
  // The CLI ran and exited non-zero without usable JSON. The documented
  // contract is exit 0 when logged in and non-zero otherwise, so treat a clean
  // numeric exit as an authoritative signed-out result.
  if (typeof failure.code === "number") {
    return { ok: true, auth: { loggedIn: false } };
  }
  if (emitted) return { ok: false, reason: "malformed-output" };
  return { ok: false, reason: "cli-missing" };
}

/**
 * Runs `claude auth status --json` and classifies the outcome into distinct
 * states instead of collapsing every failure into "unavailable". The official
 * CLI exits non-zero when signed out, so a clean numeric exit with no parseable
 * JSON is treated as signed out rather than a provider error.
 */
async function readClaudeAuthStatus(
  command: string,
  environment: NodeJS.ProcessEnv,
): Promise<ClaudeAuthReadResult> {
  try {
    const invocation = await resolveCliInvocation(
      command,
      ["auth", "status", "--json"],
      environment,
    );
    const { stdout } = await execFileAsync(invocation.file, invocation.args, {
      timeout: 8_000,
      windowsHide: true,
      maxBuffer: 128_000,
      env: environment,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    });
    if (!stdout.trim()) return { ok: false, reason: "malformed-output" };
    try {
      return { ok: true, auth: parseClaudeAuthStatus(stdout) };
    } catch {
      return { ok: false, reason: "malformed-output" };
    }
  } catch (error) {
    return classifyClaudeAuthError(
      error as NodeJS.ErrnoException & {
        stdout?: unknown;
        killed?: boolean;
        signal?: NodeJS.Signals | null;
      },
    );
  }
}

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
  // Logged in, but the reported login method was not recognized. Flag it so the
  // lifecycle treats it as unverifiable rather than a launchable account.
  const providerError: ProviderErrorReason | null =
    authMode === "unknown" ? "unknown-auth" : null;

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
    providerError,
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

const CLAUDE_FAILURE_COPY: Record<
  ProviderErrorReason,
  { label: string; notice: string }
> = {
  "cli-missing": {
    label: "Claude CLI not found",
    notice:
      "QuotaDeck could not find the Claude Code CLI. Install it or choose its executable in CLI settings.",
  },
  "cli-timeout": {
    label: "Claude CLI timed out",
    notice:
      "`claude auth status` did not respond in time. Refresh to try again, or check the CLI.",
  },
  "malformed-output": {
    label: "Claude CLI output unrecognized",
    notice:
      "`claude auth status` returned output QuotaDeck could not read. Update the official CLI.",
  },
  "unknown-auth": {
    label: "Claude login not recognized",
    notice:
      "Claude reported a login method QuotaDeck does not recognize. Sign in again with a subscription login.",
  },
};

export function mapClaudeFailure(
  reason: ProviderErrorReason,
  options: {
    id: string;
    displayName: string;
    isManaged: boolean;
    observedAt: string;
  },
): ProviderAccountSnapshot {
  const copy = CLAUDE_FAILURE_COPY[reason];
  return {
    id: options.id,
    provider: "claude",
    displayName: options.displayName,
    identity: null,
    identityVerifier: null,
    identityVerified: !options.isManaged,
    plan: null,
    authMode: "unknown",
    billingMode: "unknown",
    providerError: reason,
    quotaStatus: "unavailable",
    state: "unknown",
    isActive: !options.isManaged,
    isManaged: options.isManaged,
    quotaWindows: [],
    source: {
      label: copy.label,
      confidence: "unavailable",
      observedAt: options.observedAt,
    },
    notice: copy.notice,
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

  const status = await readClaudeAuthStatus(
    options.command ?? "claude",
    environment,
  );
  if (!status.ok) {
    return mapClaudeFailure(status.reason, {
      id,
      displayName,
      isManaged,
      observedAt,
    });
  }

  const quotaRoot = options.quotaRoot ?? options.configRoot;
  const quota = quotaRoot ? await readClaudeQuotaSnapshot(quotaRoot) : null;
  return mapClaudeSnapshot(status.auth, quota, {
    id,
    displayName,
    isManaged,
    verifiedIdentity: options.verifiedIdentity,
    verifiedIdentityVerifier: options.verifiedIdentityVerifier,
    identityKey: options.identityKey,
    observedAt,
  });
}

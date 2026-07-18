import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AccountSnapshot } from "../../shared/contracts";
import { createProfileEnvironment } from "../profiles/profile-environment";

const execFileAsync = promisify(execFile);

interface ClaudeAuthStatus {
  loggedIn?: unknown;
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
  isManaged?: boolean;
}

export async function collectClaudeSnapshot(options: ClaudeSnapshotOptions = {}): Promise<AccountSnapshot> {
  const observedAt = new Date().toISOString();
  const id = options.id ?? "claude-current";
  const displayName = options.displayName ?? "Current Claude";
  const isManaged = options.isManaged ?? false;
  const environment = createProfileEnvironment("claude", options.configRoot ?? null);

  try {
    const { stdout } = await execFileAsync("claude", ["auth", "status", "--json"], {
      timeout: 8_000,
      windowsHide: true,
      maxBuffer: 128_000,
      env: environment,
    });
    const auth = parseClaudeAuthStatus(stdout);
    const loggedIn = auth.loggedIn === true;

    return {
      id,
      provider: "claude",
      displayName,
      plan: typeof auth.subscriptionType === "string" ? auth.subscriptionType : null,
      state: loggedIn ? "ready" : "signed-out",
      isActive: !isManaged,
      isManaged,
      quotaWindows: [],
      source: {
        label: "Claude auth status",
        confidence: "local-observation",
        observedAt,
      },
      notice: loggedIn
        ? "Claude confirms this account is connected, but its CLI does not expose subscription quota as structured data."
        : "Sign in with Claude Code before this profile can be monitored.",
    };
  } catch {
    return {
      id,
      provider: "claude",
      displayName,
      plan: null,
      state: "unknown",
      isActive: !isManaged,
      isManaged,
      quotaWindows: [],
      source: { label: "Claude CLI unavailable", confidence: "unavailable", observedAt },
      notice: "QuotaDeck could not read `claude auth status`.",
    };
  }
}

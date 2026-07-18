import { spawn } from "node:child_process";
import type { AccountSnapshot, QuotaWindow } from "../../shared/contracts";
import { createProfileEnvironment } from "../profiles/profile-environment";

interface RpcResponse {
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface CodexAccountResult {
  account?: {
    type?: unknown;
    planType?: unknown;
  } | null;
  requiresOpenaiAuth?: unknown;
}

interface CodexRateLimitWindow {
  usedPercent?: unknown;
  windowDurationMins?: unknown;
  resetsAt?: unknown;
}

interface CodexRateLimitsResult {
  rateLimits?: {
    primary?: CodexRateLimitWindow | null;
    secondary?: CodexRateLimitWindow | null;
    rateLimitReachedType?: unknown;
    individualLimit?: unknown;
    spendControlReached?: unknown;
  } | null;
  rateLimitResetCredits?: {
    availableCount?: unknown;
  } | null;
}

export interface CodexAppServerQueryResult {
  account: CodexAccountResult;
  limits: CodexRateLimitsResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function windowLabel(minutes: number): string {
  if (minutes % 10_080 === 0) return `${minutes / 10_080}-week window`;
  if (minutes % 1_440 === 0) return `${minutes / 1_440}-day window`;
  if (minutes % 60 === 0) return `${minutes / 60}-hour window`;
  return `${minutes}-minute window`;
}

function normalizeWindow(id: string, raw: CodexRateLimitWindow | null | undefined): QuotaWindow | null {
  if (!raw) return null;
  const usedPercent = asNumber(raw.usedPercent);
  const windowMinutes = asNumber(raw.windowDurationMins);
  const resetsAt = asNumber(raw.resetsAt);
  if (usedPercent === null || windowMinutes === null) return null;
  return {
    id,
    label: windowLabel(windowMinutes),
    usedPercent: Math.max(0, Math.min(100, usedPercent)),
    windowMinutes,
    resetsAt: resetsAt === null ? null : new Date(resetsAt * 1_000).toISOString(),
  };
}

export function mapCodexAppServerSnapshot(
  query: CodexAppServerQueryResult,
  options: { id: string; displayName: string; isManaged: boolean; observedAt?: string },
): AccountSnapshot {
  const observedAt = options.observedAt ?? new Date().toISOString();
  const accountType = typeof query.account.account?.type === "string" ? query.account.account.type : null;
  const plan = typeof query.account.account?.planType === "string" ? query.account.account.planType : null;
  const quotaWindows = [
    normalizeWindow("primary", query.limits.rateLimits?.primary),
    normalizeWindow("secondary", query.limits.rateLimits?.secondary),
  ].filter((window): window is QuotaWindow => window !== null);
  const isChatGpt = accountType === "chatgpt";
  const isLimited = Boolean(query.limits.rateLimits?.rateLimitReachedType) || quotaWindows.some((window) => window.usedPercent >= 100);
  const resetCredits = asNumber(query.limits.rateLimitResetCredits?.availableCount);

  let notice: string;
  if (!query.account.account) {
    notice = "Sign in to Codex with a ChatGPT subscription before quota can be monitored.";
  } else if (!isChatGpt) {
    notice = "This profile uses API or external-provider billing, not ChatGPT subscription quota.";
  } else if (!quotaWindows.length) {
    notice = "Codex is connected, but the app-server returned no subscription quota windows.";
  } else {
    notice = `Live from Codex account/rateLimits/read.${resetCredits && resetCredits > 0 ? ` ${resetCredits} earned reset credit${resetCredits === 1 ? " is" : "s are"} available.` : ""}`;
  }

  return {
    id: options.id,
    provider: "codex",
    displayName: options.displayName,
    plan,
    state: !query.account.account ? "signed-out" : !isChatGpt || !quotaWindows.length ? "unknown" : isLimited ? "limited" : "ready",
    isActive: !options.isManaged,
    isManaged: options.isManaged,
    quotaWindows,
    source: {
      label: "Codex app-server",
      confidence: quotaWindows.length ? "provider-reported" : "local-observation",
      observedAt,
    },
    notice,
  };
}

export async function queryCodexAppServer(codexHome: string, timeoutMs = 8_000): Promise<CodexAppServerQueryResult> {
  const environment = createProfileEnvironment("codex", codexHome);
  const child = spawn("codex", ["app-server", "--stdio"], {
    env: environment,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    shell: false,
  });

  let buffer = "";
  let nextId = 1;
  let startupError: Error | null = null;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  const rejectPending = (error: Error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  child.once("error", (error) => {
    startupError = error;
    rejectPending(error);
  });
  child.stdin.on("error", () => {
    // The exit/error handlers reject pending requests; never surface pipe contents.
  });
  child.stderr.resume();
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line) as RpcResponse;
        if (typeof message.id !== "number") continue;
        const request = pending.get(message.id);
        if (!request) continue;
        pending.delete(message.id);
        if (message.error) {
          request.reject(new Error(`Codex app-server error ${message.error.code ?? "unknown"}: ${message.error.message ?? "Unknown error"}`));
        } else {
          request.resolve(message.result);
        }
      } catch {
        // Ignore non-protocol stdout rather than risk exposing it in logs.
      }
    }
  });
  child.once("exit", (code) => {
    if (pending.size) rejectPending(new Error(`Codex app-server exited before responding (code ${code ?? "unknown"}).`));
  });

  const write = (message: Record<string, unknown>) => {
    if (startupError) throw startupError;
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };
  const request = (method: string, params?: Record<string, unknown>) => {
    const id = nextId;
    nextId += 1;
    return new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        write({ method, id, ...(params ? { params } : {}) });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  };

  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error("Codex app-server quota query timed out.")), timeoutMs).unref();
  });

  try {
    const operation = (async () => {
      await request("initialize", {
        clientInfo: { name: "quota_deck", title: "QuotaDeck", version: "0.1.0" },
      });
      write({ method: "initialized", params: {} });
      const [account, limits] = await Promise.all([
        request("account/read", { refreshToken: false }),
        request("account/rateLimits/read"),
      ]);
      if (!isRecord(account) || !isRecord(limits)) throw new Error("Codex app-server returned an invalid account payload.");
      return { account: account as CodexAccountResult, limits: limits as CodexRateLimitsResult };
    })();
    return await Promise.race([operation, timeout]);
  } finally {
    rejectPending(new Error("Codex app-server connection closed."));
    child.stdin.end();
    child.kill();
  }
}

export async function collectCodexAppServerSnapshot(
  codexHome: string,
  options: { id: string; displayName: string; isManaged: boolean },
): Promise<AccountSnapshot> {
  return mapCodexAppServerSnapshot(await queryCodexAppServer(codexHome), options);
}

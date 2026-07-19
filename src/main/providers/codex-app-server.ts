import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { QuotaWindow } from "../../shared/contracts";
import { createProfileEnvironment } from "../profiles/profile-environment";
import type { ProviderAccountSnapshot } from "./provider-snapshot";
import {
  classifyQuotaStatus,
  createIdentityVerifier,
  maskAccountIdentity,
} from "./snapshot-policy";
import { safeIsoFromEpochSeconds } from "./time-normalization";

const MAX_CODEX_PROTOCOL_BUFFER_BYTES = 512 * 1024;

interface RpcResponse {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface CodexAccountResult {
  account?: {
    type?: unknown;
    email?: unknown;
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

export function mergeCodexRateLimitsUpdate(
  current: CodexRateLimitsResult,
  update: CodexRateLimitsResult,
): CodexRateLimitsResult {
  const currentLimits = current.rateLimits ?? {};
  const updateLimits = update.rateLimits ?? {};
  const mergeWindow = (
    previous: CodexRateLimitWindow | null | undefined,
    next: CodexRateLimitWindow | null | undefined,
  ) => (next ? { ...(previous ?? {}), ...next } : previous);

  return {
    rateLimits:
      current.rateLimits || update.rateLimits
        ? {
            ...currentLimits,
            ...updateLimits,
            primary: mergeWindow(currentLimits.primary, updateLimits.primary),
            secondary: mergeWindow(
              currentLimits.secondary,
              updateLimits.secondary,
            ),
            individualLimit:
              updateLimits.individualLimit == null
                ? currentLimits.individualLimit
                : updateLimits.individualLimit,
            spendControlReached:
              updateLimits.spendControlReached == null
                ? currentLimits.spendControlReached
                : updateLimits.spendControlReached,
          }
        : null,
    rateLimitResetCredits:
      update.rateLimitResetCredits ?? current.rateLimitResetCredits,
  };
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

export function appendCodexProtocolChunk(
  current: string,
  chunk: string,
  maxBytes = MAX_CODEX_PROTOCOL_BUFFER_BYTES,
): { lines: string[]; remainder: string } {
  const combined = current + chunk;
  if (Buffer.byteLength(combined, "utf8") > maxBytes) {
    throw new Error("Codex app-server output exceeded the safety limit.");
  }
  const lines = combined.split(/\r?\n/);
  return { lines: lines.slice(0, -1), remainder: lines.at(-1) ?? "" };
}

function windowLabel(minutes: number): string {
  if (minutes % 10_080 === 0) return `${minutes / 10_080}-week window`;
  if (minutes % 1_440 === 0) return `${minutes / 1_440}-day window`;
  if (minutes % 60 === 0) return `${minutes / 60}-hour window`;
  return `${minutes}-minute window`;
}

function normalizeWindow(
  id: string,
  raw: CodexRateLimitWindow | null | undefined,
): QuotaWindow | null {
  if (!raw) return null;
  const usedPercent = asNumber(raw.usedPercent);
  const windowMinutes = asNumber(raw.windowDurationMins);
  const resetsAt = asNumber(raw.resetsAt);
  if (usedPercent === null || windowMinutes === null || windowMinutes <= 0) {
    return null;
  }
  return {
    id,
    label: windowLabel(windowMinutes),
    usedPercent: Math.max(0, Math.min(100, usedPercent)),
    windowMinutes,
    resetsAt: safeIsoFromEpochSeconds(resetsAt),
  };
}

export function mapCodexAppServerSnapshot(
  query: CodexAppServerQueryResult,
  options: {
    id: string;
    displayName: string;
    isManaged: boolean;
    verifiedIdentity?: string | null;
    verifiedIdentityVerifier?: string | null;
    identityKey?: Uint8Array;
    observedAt?: string;
    evaluatedAt?: string;
  },
): ProviderAccountSnapshot {
  const observedAt = options.observedAt ?? new Date().toISOString();
  const accountType =
    typeof query.account.account?.type === "string"
      ? query.account.account.type
      : null;
  const plan =
    typeof query.account.account?.planType === "string"
      ? query.account.account.planType
      : null;
  const quotaWindows = [
    normalizeWindow("primary", query.limits.rateLimits?.primary),
    normalizeWindow("secondary", query.limits.rateLimits?.secondary),
  ].filter((window): window is QuotaWindow => window !== null);
  const isChatGpt = accountType === "chatgpt";
  const authMode = !query.account.account
    ? ("signed-out" as const)
    : isChatGpt
      ? ("subscription" as const)
      : accountType === "apiKey"
        ? ("api-key" as const)
        : accountType
          ? ("external-provider" as const)
          : ("unknown" as const);
  const billingMode = isChatGpt
    ? ("subscription" as const)
    : accountType === "apiKey"
      ? ("api" as const)
      : accountType
        ? ("external" as const)
        : ("unknown" as const);
  const isLimited =
    Boolean(query.limits.rateLimits?.rateLimitReachedType) ||
    quotaWindows.some((window) => window.usedPercent >= 100);
  const resetCredits = asNumber(
    query.limits.rateLimitResetCredits?.availableCount,
  );

  let notice: string;
  if (!query.account.account) {
    notice =
      "Sign in to Codex with a ChatGPT subscription before quota can be monitored.";
  } else if (!isChatGpt) {
    notice =
      "This profile uses API or external-provider billing, not ChatGPT subscription quota.";
  } else if (!quotaWindows.length) {
    notice =
      "Codex is connected, but the app-server returned no subscription quota windows.";
  } else {
    notice = `Live from Codex account/rateLimits/read.${resetCredits && resetCredits > 0 ? ` ${resetCredits} earned reset credit${resetCredits === 1 ? " is" : "s are"} available.` : ""}`;
  }

  const identity = maskAccountIdentity(query.account.account?.email);
  const identityVerifier = createIdentityVerifier(
    query.account.account?.email,
    options.identityKey,
  );
  return {
    id: options.id,
    provider: "codex",
    displayName: options.displayName,
    identity,
    identityVerifier,
    identityVerified:
      !options.isManaged ||
      (identityVerifier !== null &&
        identityVerifier === options.verifiedIdentityVerifier),
    plan,
    authMode,
    billingMode,
    providerError: null,
    quotaStatus: classifyQuotaStatus({
      authMode,
      billingMode,
      windows: quotaWindows,
      observedAt,
      evaluatedAt: options.evaluatedAt,
      partial: isChatGpt && quotaWindows.length === 0,
    }),
    state: !query.account.account
      ? "signed-out"
      : !isChatGpt || !quotaWindows.length
        ? "unknown"
        : isLimited
          ? "limited"
          : "ready",
    isActive: !options.isManaged,
    isManaged: options.isManaged,
    quotaWindows,
    source: {
      label: "Codex app-server",
      confidence: quotaWindows.length
        ? "provider-reported"
        : "local-observation",
      observedAt,
    },
    notice,
  };
}

export class CodexAppServerConnection {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private nextId = 1;
  private startupError: Error | null = null;
  private initializePromise: Promise<void> | null = null;
  private latestLimits: CodexRateLimitsResult | null = null;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  constructor(
    private readonly codexHome: string,
    private readonly command = "codex",
    private readonly timeoutMs = 8_000,
  ) {}

  private rejectPending(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
  }

  private handleChunk(chunk: string): void {
    let lines: string[];
    try {
      const next = appendCodexProtocolChunk(this.buffer, chunk);
      this.buffer = next.remainder;
      lines = next.lines;
    } catch (error) {
      const protocolError =
        error instanceof Error
          ? error
          : new Error("Codex app-server output was invalid.");
      this.startupError = protocolError;
      this.rejectPending(protocolError);
      this.child?.kill();
      return;
    }
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line) as RpcResponse;
        if (typeof message.id !== "number") {
          if (
            message.method === "account/rateLimits/updated" &&
            isRecord(message.params)
          ) {
            this.latestLimits = mergeCodexRateLimitsUpdate(
              this.latestLimits ?? {},
              message.params as CodexRateLimitsResult,
            );
          }
          continue;
        }
        const request = this.pending.get(message.id);
        if (!request) continue;
        clearTimeout(request.timeout);
        this.pending.delete(message.id);
        if (message.error) {
          request.reject(
            new Error(
              `Codex app-server error ${message.error.code ?? "unknown"}: ${message.error.message ?? "Unknown error"}`,
            ),
          );
        } else {
          request.resolve(message.result);
        }
      } catch {
        // Ignore non-protocol stdout rather than risk exposing it in logs.
      }
    }
  }

  private async initialize(): Promise<void> {
    const environment = createProfileEnvironment("codex", this.codexHome);
    const child = spawn(this.command, ["app-server", "--stdio"], {
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    });
    this.child = child;
    child.once("error", (error) => {
      this.startupError = error;
      this.rejectPending(error);
    });
    child.stdin.on("error", () => {
      // Exit/error handlers reject pending requests; pipe contents stay private.
    });
    child.stderr.resume();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.handleChunk(chunk));
    child.once("exit", (code) => {
      this.child = null;
      this.initializePromise = null;
      if (this.pending.size)
        this.rejectPending(
          new Error(
            `Codex app-server exited before responding (code ${code ?? "unknown"}).`,
          ),
        );
    });
    await this.request("initialize", {
      clientInfo: {
        name: "quota_deck",
        title: "QuotaDeck",
        version: "0.1.0",
      },
    });
    this.write({ method: "initialized", params: {} });
  }

  async start(): Promise<void> {
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = this.initialize();
    try {
      await this.initializePromise;
    } catch (error) {
      this.close();
      throw error;
    }
  }

  private write(message: Record<string, unknown>): void {
    if (this.startupError) throw this.startupError;
    if (!this.child) throw new Error("Codex app-server is not running.");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Codex app-server operation timed out."));
      }, this.timeoutMs);
      timeout.unref();
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.write({ method, id, ...(params ? { params } : {}) });
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async readSnapshot(): Promise<CodexAppServerQueryResult> {
    await this.start();
    const [account, limits] = await Promise.all([
      this.request("account/read", { refreshToken: false }),
      this.request("account/rateLimits/read"),
    ]);
    if (!isRecord(account) || !isRecord(limits)) {
      throw new Error("Codex app-server returned an invalid account payload.");
    }
    this.latestLimits = limits as CodexRateLimitsResult;
    return {
      account: account as CodexAccountResult,
      limits: this.latestLimits,
    };
  }

  async logout(): Promise<void> {
    await this.start();
    await this.request("account/logout");
  }

  close(): void {
    this.rejectPending(new Error("Codex app-server connection closed."));
    this.child?.stdin.end();
    this.child?.kill();
    this.child = null;
    this.initializePromise = null;
  }
}

export interface CodexMonitorConnection {
  readSnapshot(): Promise<CodexAppServerQueryResult>;
  logout(): Promise<void>;
  close(): void;
}

type CodexMonitorConnectionFactory = (
  codexHome: string,
  command: string,
) => CodexMonitorConnection;

export class CodexMonitorManager {
  private readonly connections = new Map<string, CodexMonitorConnection>();

  constructor(
    private readonly createConnection: CodexMonitorConnectionFactory = (
      codexHome,
      command,
    ) => new CodexAppServerConnection(codexHome, command),
    private readonly maxRetainedConnections = 8,
  ) {}

  private key(codexHome: string, command: string): string {
    return `${command}\u0000${codexHome}`;
  }

  private connection(codexHome: string, command: string) {
    const key = this.key(codexHome, command);
    const existing = this.connections.get(key);
    if (existing) return { key, connection: existing, retained: true };

    const connection = this.createConnection(codexHome, command);
    const retained = this.connections.size < this.maxRetainedConnections;
    if (retained) {
      this.connections.set(key, connection);
    }
    return { key, connection, retained };
  }

  async collectSnapshot(
    codexHome: string,
    options: {
      id: string;
      displayName: string;
      isManaged: boolean;
      verifiedIdentity?: string | null;
      verifiedIdentityVerifier?: string | null;
      identityKey?: Uint8Array;
      command?: string;
    },
  ): Promise<ProviderAccountSnapshot> {
    const command = options.command ?? "codex";
    const { key, connection, retained } = this.connection(codexHome, command);
    try {
      return mapCodexAppServerSnapshot(
        await connection.readSnapshot(),
        options,
      );
    } catch (error) {
      if (retained) {
        connection.close();
        this.connections.delete(key);
      }
      throw error;
    } finally {
      if (!retained) connection.close();
    }
  }

  async logoutProfile(codexHome: string, command = "codex"): Promise<void> {
    const { key, connection } = this.connection(codexHome, command);
    try {
      await connection.logout();
    } finally {
      connection.close();
      this.connections.delete(key);
    }
  }

  stopProfile(codexHome: string, command = "codex"): void {
    const key = this.key(codexHome, command);
    this.connections.get(key)?.close();
    this.connections.delete(key);
  }

  stopAll(): void {
    for (const connection of this.connections.values()) connection.close();
    this.connections.clear();
  }
}

export async function queryCodexAppServer(
  codexHome: string,
  timeoutMs = 8_000,
  command = "codex",
): Promise<CodexAppServerQueryResult> {
  const connection = new CodexAppServerConnection(
    codexHome,
    command,
    timeoutMs,
  );
  try {
    return await connection.readSnapshot();
  } finally {
    connection.close();
  }
}

export async function logoutCodexAppServer(
  codexHome: string,
  timeoutMs = 8_000,
  command = "codex",
): Promise<void> {
  const connection = new CodexAppServerConnection(
    codexHome,
    command,
    timeoutMs,
  );
  try {
    await connection.logout();
  } finally {
    connection.close();
  }
}

export async function collectCodexAppServerSnapshot(
  codexHome: string,
  options: {
    id: string;
    displayName: string;
    isManaged: boolean;
    verifiedIdentity?: string | null;
    verifiedIdentityVerifier?: string | null;
    identityKey?: Uint8Array;
    command?: string;
  },
): Promise<ProviderAccountSnapshot> {
  return mapCodexAppServerSnapshot(
    await queryCodexAppServer(codexHome, 8_000, options.command),
    options,
  );
}

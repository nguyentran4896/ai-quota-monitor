import { describe, expect, it, vi } from "vitest";
import {
  appendCodexProtocolChunk,
  CodexMonitorManager,
  mapCodexAppServerSnapshot,
  mergeCodexRateLimitsUpdate,
} from "../src/main/providers/codex-app-server";

describe("mapCodexAppServerSnapshot", () => {
  it("normalizes official account and quota RPC results", () => {
    const snapshot = mapCodexAppServerSnapshot(
      {
        account: {
          account: {
            type: "chatgpt",
            email: "developer@example.com",
            planType: "pro",
          },
          requiresOpenaiAuth: true,
        },
        limits: {
          rateLimits: {
            primary: {
              usedPercent: 12.5,
              windowDurationMins: 300,
              resetsAt: 1_800_000_000,
            },
            secondary: {
              usedPercent: 40,
              windowDurationMins: 10_080,
              resetsAt: 1_800_500_000,
            },
            rateLimitReachedType: null,
          },
          rateLimitResetCredits: { availableCount: 2 },
        },
      },
      {
        id: "codex-work",
        displayName: "Codex Work",
        isManaged: true,
        observedAt: "2026-07-18T00:00:00.000Z",
        evaluatedAt: "2026-07-18T00:05:00.000Z",
      },
    );

    expect(snapshot.plan).toBe("pro");
    expect(snapshot.state).toBe("ready");
    expect(snapshot.identity).toBe("d***@example.com");
    expect(snapshot.authMode).toBe("subscription");
    expect(snapshot.billingMode).toBe("subscription");
    expect(snapshot.quotaStatus).toBe("fresh");
    expect(snapshot.quotaWindows).toEqual([
      expect.objectContaining({
        id: "primary",
        label: "5-hour window",
        usedPercent: 12.5,
      }),
      expect.objectContaining({
        id: "secondary",
        label: "1-week window",
        usedPercent: 40,
      }),
    ]);
    expect(snapshot.source.label).toBe("Codex app-server");
    expect(snapshot.notice).toContain("2 earned reset credits");
  });

  it("keeps malformed provider timestamps from crashing dashboard mapping", () => {
    const snapshot = mapCodexAppServerSnapshot(
      {
        account: {
          account: { type: "chatgpt", email: "safe@example.com" },
        },
        limits: {
          rateLimits: {
            primary: {
              usedPercent: 10,
              windowDurationMins: 300,
              resetsAt: Number.MAX_VALUE,
            },
            secondary: {
              usedPercent: 20,
              windowDurationMins: -1,
              resetsAt: 1_800_000_000,
            },
          },
        },
      },
      {
        id: "codex-safe",
        displayName: "Codex Safe",
        isManaged: false,
        observedAt: "2026-07-18T00:00:00.000Z",
      },
    );

    expect(snapshot.quotaWindows).toHaveLength(1);
    expect(snapshot.quotaWindows[0]?.resetsAt).toBeNull();
  });

  it("does not present API billing as subscription quota", () => {
    const snapshot = mapCodexAppServerSnapshot(
      {
        account: { account: { type: "apiKey" }, requiresOpenaiAuth: true },
        limits: { rateLimits: null },
      },
      { id: "codex-api", displayName: "Codex API", isManaged: true },
    );
    expect(snapshot.state).toBe("unknown");
    expect(snapshot.authMode).toBe("api-key");
    expect(snapshot.billingMode).toBe("api");
    expect(snapshot.quotaStatus).toBe("unavailable");
    expect(snapshot.quotaWindows).toEqual([]);
    expect(snapshot.notice).toContain("API or external-provider billing");
  });

  it("does not treat an expired quota observation as refreshed", () => {
    const snapshot = mapCodexAppServerSnapshot(
      {
        account: {
          account: { type: "chatgpt", planType: "plus" },
          requiresOpenaiAuth: true,
        },
        limits: {
          rateLimits: {
            primary: {
              usedPercent: 100,
              windowDurationMins: 300,
              resetsAt: 1_800_000_000,
            },
          },
        },
      },
      {
        id: "codex-stale",
        displayName: "Codex Stale",
        isManaged: false,
        observedAt: "2027-01-15T08:00:00.000Z",
        evaluatedAt: "2027-01-15T08:00:01.000Z",
      },
    );

    expect(snapshot.quotaStatus).toBe("awaiting-refresh");
  });
});

describe("Codex app-server protocol buffering", () => {
  it("returns complete protocol lines and retains only the partial line", () => {
    expect(appendCodexProtocolChunk("", '{"id":1}\n{"id":', 64)).toEqual({
      lines: ['{"id":1}'],
      remainder: '{"id":',
    });
  });

  it("rejects protocol output that exceeds the configured memory ceiling", () => {
    expect(() => appendCodexProtocolChunk("12345", "67890", 8)).toThrow(
      "safety limit",
    );
  });
});

describe("Codex rate-limit notifications", () => {
  it("merges sparse updates without clearing snapshot-only fields", () => {
    expect(
      mergeCodexRateLimitsUpdate(
        {
          rateLimits: {
            primary: { usedPercent: 10, windowDurationMins: 300 },
            secondary: { usedPercent: 20, windowDurationMins: 10_080 },
            individualLimit: { monthly: 100 },
            spendControlReached: false,
          },
          rateLimitResetCredits: { availableCount: 2 },
        },
        {
          rateLimits: {
            primary: { usedPercent: 35 },
            spendControlReached: null,
          },
        },
      ),
    ).toEqual({
      rateLimits: {
        primary: { usedPercent: 35, windowDurationMins: 300 },
        secondary: { usedPercent: 20, windowDurationMins: 10_080 },
        individualLimit: { monthly: 100 },
        spendControlReached: false,
      },
      rateLimitResetCredits: { availableCount: 2 },
    });
  });
});

describe("CodexMonitorManager", () => {
  it("keeps one app-server connection alive per monitored profile", async () => {
    const connection = {
      readSnapshot: vi.fn().mockResolvedValue({
        account: {
          account: {
            type: "chatgpt",
            email: "developer@example.com",
            planType: "pro",
          },
          requiresOpenaiAuth: true,
        },
        limits: {
          rateLimits: {
            primary: { usedPercent: 25, windowDurationMins: 300 },
          },
        },
      }),
      logout: vi.fn(),
      close: vi.fn(),
    };
    const factory = vi.fn(() => connection);
    const manager = new CodexMonitorManager(factory);
    const options = {
      id: "codex-work",
      displayName: "Codex Work",
      isManaged: true,
      command: "codex",
    };

    await manager.collectSnapshot("C:\\QuotaDeck\\codex-work", options);
    await manager.collectSnapshot("C:\\QuotaDeck\\codex-work", options);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(connection.readSnapshot).toHaveBeenCalledTimes(2);
    manager.stopProfile("C:\\QuotaDeck\\codex-work", "codex");
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it("bounds retained app-server processes and uses short-lived overflow connections", async () => {
    const connections = Array.from({ length: 2 }, () => ({
      readSnapshot: vi.fn().mockResolvedValue({
        account: { account: null, requiresOpenaiAuth: true },
        limits: { rateLimits: null },
      }),
      logout: vi.fn(),
      close: vi.fn(),
    }));
    const factory = vi
      .fn()
      .mockReturnValueOnce(connections[0])
      .mockReturnValueOnce(connections[1]);
    const manager = new CodexMonitorManager(factory, 1);
    const options = {
      id: "codex-overflow",
      displayName: "Codex Overflow",
      isManaged: true,
      command: "codex",
    };

    await manager.collectSnapshot("C:\\QuotaDeck\\retained", options);
    await manager.collectSnapshot("C:\\QuotaDeck\\overflow", options);
    await manager.collectSnapshot("C:\\QuotaDeck\\retained", options);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(connections[0]?.readSnapshot).toHaveBeenCalledTimes(2);
    expect(connections[0]?.close).not.toHaveBeenCalled();
    expect(connections[1]?.readSnapshot).toHaveBeenCalledTimes(1);
    expect(connections[1]?.close).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  appendCodexProtocolChunk,
  mapCodexAppServerSnapshot,
} from "../src/main/providers/codex-app-server";

describe("mapCodexAppServerSnapshot", () => {
  it("normalizes official account and quota RPC results", () => {
    const snapshot = mapCodexAppServerSnapshot(
      {
        account: {
          account: { type: "chatgpt", planType: "pro" },
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
      },
    );

    expect(snapshot.plan).toBe("pro");
    expect(snapshot.state).toBe("ready");
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

  it("does not present API billing as subscription quota", () => {
    const snapshot = mapCodexAppServerSnapshot(
      {
        account: { account: { type: "apiKey" }, requiresOpenaiAuth: true },
        limits: { rateLimits: null },
      },
      { id: "codex-api", displayName: "Codex API", isManaged: true },
    );
    expect(snapshot.state).toBe("unknown");
    expect(snapshot.quotaWindows).toEqual([]);
    expect(snapshot.notice).toContain("API or external-provider billing");
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

import { describe, expect, it } from "vitest";
import { mapCodexAppServerSnapshot } from "../src/main/providers/codex-app-server";

describe("mapCodexAppServerSnapshot", () => {
  it("normalizes official account and quota RPC results", () => {
    const snapshot = mapCodexAppServerSnapshot(
      {
        account: { account: { type: "chatgpt", planType: "pro" }, requiresOpenaiAuth: true },
        limits: {
          rateLimits: {
            primary: { usedPercent: 12.5, windowDurationMins: 300, resetsAt: 1_800_000_000 },
            secondary: { usedPercent: 40, windowDurationMins: 10_080, resetsAt: 1_800_500_000 },
            rateLimitReachedType: null,
          },
          rateLimitResetCredits: { availableCount: 2 },
        },
      },
      { id: "codex-work", displayName: "Codex Work", isManaged: true, observedAt: "2026-07-18T00:00:00.000Z" },
    );

    expect(snapshot.plan).toBe("pro");
    expect(snapshot.state).toBe("ready");
    expect(snapshot.quotaWindows).toEqual([
      expect.objectContaining({ id: "primary", label: "5-hour window", usedPercent: 12.5 }),
      expect.objectContaining({ id: "secondary", label: "1-week window", usedPercent: 40 }),
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

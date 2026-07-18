import { describe, expect, it } from "vitest";
import { parseClaudeQuotaSnapshot } from "../src/main/providers/claude-statusline";

describe("parseClaudeQuotaSnapshot", () => {
  it("normalizes five-hour and seven-day official status-line windows", () => {
    const snapshot = parseClaudeQuotaSnapshot(
      `\uFEFF${JSON.stringify({
        schemaVersion: 1,
        observedAt: "2026-07-18T00:00:00.000Z",
        cliVersion: "2.1.214",
        rateLimits: {
          fiveHour: { usedPercent: 23.5, resetsAt: 1_800_000_000 },
          sevenDay: { usedPercent: 41.2, resetsAt: 1_800_500_000 },
        },
      })}`,
    );
    expect(snapshot.quotaWindows).toEqual([
      expect.objectContaining({ id: "five-hour", label: "5-hour window", usedPercent: 23.5 }),
      expect.objectContaining({ id: "seven-day", label: "7-day window", usedPercent: 41.2 }),
    ]);
  });

  it("rejects unsupported snapshot files", () => {
    expect(() => parseClaudeQuotaSnapshot('{"schemaVersion":2}')).toThrow("Unsupported");
  });
});

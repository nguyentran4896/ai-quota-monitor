import { describe, expect, it } from "vitest";
import { extractLatestRateLimits } from "../src/main/providers/codex-session";

describe("extractLatestRateLimits", () => {
  it("returns the newest provider-reported quota snapshot", () => {
    const jsonl = [
      JSON.stringify({ payload: { rate_limits: { plan_type: "pro", primary: { used_percent: 2 } } } }),
      JSON.stringify({ payload: { harmless_session_content: "never returned" } }),
      JSON.stringify({ payload: { rate_limits: { plan_type: "pro", primary: { used_percent: 7 } } } }),
    ].join("\n");

    expect(extractLatestRateLimits(jsonl)).toEqual({
      plan_type: "pro",
      primary: { used_percent: 7 },
    });
  });

  it("ignores partially-written and unrelated lines", () => {
    const jsonl = '{"payload":{"message":"rate_limits mentioned in prose"}}\n{"payload":{"rate_limits":';
    expect(extractLatestRateLimits(jsonl)).toBeNull();
  });
});


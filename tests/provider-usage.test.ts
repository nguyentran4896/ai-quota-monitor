import { describe, expect, it } from "vitest";
import { providerUsageUrl } from "../src/main/providers/provider-usage";

describe("providerUsageUrl", () => {
  it("only returns fixed official HTTPS help URLs", () => {
    expect(providerUsageUrl("claude")).toMatch(
      /^https:\/\/support\.claude\.com\//,
    );
    expect(providerUsageUrl("codex")).toMatch(/^https:\/\/help\.openai\.com\//);
  });
});

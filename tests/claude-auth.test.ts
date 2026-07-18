import { describe, expect, it } from "vitest";
import { parseClaudeAuthStatus } from "../src/main/providers/claude-auth";

describe("parseClaudeAuthStatus", () => {
  it("parses the supported local auth status shape", () => {
    expect(
      parseClaudeAuthStatus(
        JSON.stringify({
          loggedIn: true,
          subscriptionType: "max",
          authMethod: "claude.ai",
        }),
      ),
    ).toMatchObject({ loggedIn: true, subscriptionType: "max" });
  });

  it("rejects non-object payloads", () => {
    expect(() => parseClaudeAuthStatus("[]")).toThrow("not an object");
  });
});

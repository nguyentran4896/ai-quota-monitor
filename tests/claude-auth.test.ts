import { describe, expect, it } from "vitest";
import {
  describeClaudeNotice,
  parseClaudeAuthStatus,
} from "../src/main/providers/claude-auth";

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

describe("Claude quota guidance", () => {
  it("tells the current profile to launch and complete a response", () => {
    expect(describeClaudeNotice(true, false)).toContain("Launch this profile");
    expect(describeClaudeNotice(true, false)).not.toContain("Add a managed");
  });
});

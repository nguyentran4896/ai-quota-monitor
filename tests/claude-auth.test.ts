import { describe, expect, it } from "vitest";
import {
  describeClaudeNotice,
  mapClaudeSnapshot,
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

  it("shows masked identity, subscription billing, and a first-response state", () => {
    const snapshot = mapClaudeSnapshot(
      {
        loggedIn: true,
        email: "artist@example.com",
        subscriptionType: "max",
        authMethod: "claude.ai",
      },
      null,
      {
        id: "claude-work",
        displayName: "Claude Work",
        isManaged: true,
        observedAt: "2026-07-18T00:00:00.000Z",
        evaluatedAt: "2026-07-18T00:01:00.000Z",
      },
    );

    expect(snapshot.identity).toBe("a***@example.com");
    expect(snapshot.authMode).toBe("subscription");
    expect(snapshot.billingMode).toBe("subscription");
    expect(snapshot.quotaStatus).toBe("needs-first-response");
  });
});

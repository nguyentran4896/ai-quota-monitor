import { describe, expect, it } from "vitest";
import {
  classifyClaudeAuthError,
  describeClaudeNotice,
  mapClaudeFailure,
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
    expect(snapshot.providerError).toBeNull();
  });

  it("flags a logged-in account with an unrecognized method as unknown-auth", () => {
    const snapshot = mapClaudeSnapshot(
      { loggedIn: true, authMethod: "mystery-sso" },
      null,
      {
        id: "claude-work",
        displayName: "Claude Work",
        isManaged: true,
        observedAt: "2026-07-18T00:00:00.000Z",
      },
    );

    expect(snapshot.authMode).toBe("unknown");
    expect(snapshot.providerError).toBe("unknown-auth");
  });
});

describe("classifyClaudeAuthError", () => {
  it("keeps signed-out, missing, timeout, and malformed states distinct", () => {
    // A missing executable is not the same as a timeout or a broken CLI.
    expect(classifyClaudeAuthError({ code: "ENOENT" })).toEqual({
      ok: false,
      reason: "cli-missing",
    });
    expect(
      classifyClaudeAuthError({ killed: true, signal: "SIGTERM" }),
    ).toEqual({ ok: false, reason: "cli-timeout" });

    // A clean non-zero exit with no JSON is the documented signed-out signal.
    expect(classifyClaudeAuthError({ code: 1 })).toEqual({
      ok: true,
      auth: { loggedIn: false },
    });

    // Signed-out builds that still print JSON on exit 1 are honored.
    expect(
      classifyClaudeAuthError({ code: 1, stdout: '{"loggedIn":false}' }),
    ).toEqual({ ok: true, auth: { loggedIn: false } });

    // A logged-in payload emitted on a non-zero exit is still parsed.
    expect(
      classifyClaudeAuthError({
        code: 1,
        stdout: '{"loggedIn":true,"subscriptionType":"max"}',
      }),
    ).toMatchObject({ ok: true, auth: { loggedIn: true } });

    // A spawn failure with no exit code and no output is unavailable, not
    // silently signed-out.
    expect(classifyClaudeAuthError({ code: "EACCES" })).toEqual({
      ok: false,
      reason: "cli-missing",
    });
  });
});

describe("mapClaudeFailure", () => {
  it("builds distinct snapshots per provider-error reason", () => {
    const base = {
      id: "claude-work",
      displayName: "Claude Work",
      isManaged: true,
      observedAt: "2026-07-18T00:00:00.000Z",
    };
    const missing = mapClaudeFailure("cli-missing", base);
    const timeout = mapClaudeFailure("cli-timeout", base);

    expect(missing.providerError).toBe("cli-missing");
    expect(missing.authMode).toBe("unknown");
    expect(missing.source.label).not.toBe(timeout.source.label);
    expect(timeout.providerError).toBe("cli-timeout");
  });
});

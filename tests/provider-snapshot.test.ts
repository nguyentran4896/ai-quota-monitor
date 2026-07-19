import { describe, expect, it } from "vitest";
import { toPublicAccountSnapshot } from "../src/main/providers/provider-snapshot";

describe("toPublicAccountSnapshot", () => {
  it("removes the account verifier before a snapshot reaches the renderer", () => {
    const publicSnapshot = toPublicAccountSnapshot(
      {
        id: "codex-work",
        provider: "codex",
        displayName: "Codex — Work",
        identity: "w***@example.com",
        identityVerifier: "a".repeat(64),
        identityVerified: true,
        plan: "pro",
        authMode: "subscription",
        billingMode: "subscription",
        providerError: null,
        quotaStatus: "fresh",
        state: "ready",
        isActive: true,
        isManaged: true,
        quotaWindows: [],
        source: {
          label: "Codex app-server",
          confidence: "provider-reported",
          observedAt: "2026-07-18T00:00:00.000Z",
        },
        notice: null,
      },
      { verifiedIdentityVerifier: "a".repeat(64) },
    );

    expect(publicSnapshot).not.toHaveProperty("identityVerifier");
    expect(publicSnapshot.lifecycle).toBe("verified");
  });
});

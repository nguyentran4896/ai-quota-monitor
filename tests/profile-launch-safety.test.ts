import { describe, expect, it } from "vitest";
import { evaluateProfileLaunchSafety } from "../src/main/profiles/profile-launch-safety";
import type { ProviderProfile } from "../src/main/profiles/profile-store";
import type { ProviderAccountSnapshot } from "../src/main/providers/provider-snapshot";

const profile: ProviderProfile = {
  id: "codex-work",
  provider: "codex",
  displayName: "Codex Work",
  configRoot: "C:\\QuotaDeck\\codex-work",
  quotaRoot: "C:\\QuotaDeck\\codex-work",
  isManaged: true,
  verifiedIdentity: null,
  verifiedIdentityVerifier: null,
  createdAt: "2026-07-18T00:00:00.000Z",
};

const snapshot: ProviderAccountSnapshot = {
  id: profile.id,
  provider: "codex",
  displayName: profile.displayName,
  identity: "d***@example.com",
  identityVerifier: "a".repeat(64),
  identityVerified: false,
  plan: "pro",
  authMode: "subscription",
  billingMode: "subscription",
  quotaStatus: "fresh",
  state: "ready",
  isActive: false,
  isManaged: true,
  quotaWindows: [],
  source: {
    label: "Codex app-server",
    confidence: "provider-reported",
    observedAt: "2026-07-18T00:00:00.000Z",
  },
  notice: null,
};

describe("evaluateProfileLaunchSafety", () => {
  it("requires identity verification before the first managed launch", () => {
    expect(evaluateProfileLaunchSafety(profile, snapshot)).toMatchObject({
      kind: "confirm",
      verifyIdentity: {
        maskedIdentity: "d***@example.com",
        verifier: "a".repeat(64),
      },
      confirmBilling: false,
    });
  });

  it("requires confirmation whenever a profile can use API billing", () => {
    expect(
      evaluateProfileLaunchSafety(
        { ...profile, isManaged: false },
        {
          ...snapshot,
          authMode: "api-key",
          billingMode: "api",
          quotaStatus: "unavailable",
        },
      ),
    ).toMatchObject({
      kind: "confirm",
      verifyIdentity: null,
      confirmBilling: true,
    });
  });

  it("blocks a managed profile whose identity cannot be verified", () => {
    expect(
      evaluateProfileLaunchSafety(profile, {
        ...snapshot,
        identity: null,
        identityVerifier: null,
      }),
    ).toMatchObject({ kind: "block" });
  });
});

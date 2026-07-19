import { describe, expect, it } from "vitest";
import { deriveLifecycle } from "../src/main/providers/snapshot-policy";

const VERIFIER = "a".repeat(64);

const base = {
  isManaged: true,
  authMode: "signed-out" as const,
  identity: null as string | null,
  identityVerifier: null as string | null,
  verifiedIdentityVerifier: null as string | null,
  providerError: null as null | "cli-missing",
};

describe("deriveLifecycle", () => {
  it("puts a brand-new managed profile in pending-login, even when the CLI failed", () => {
    // The onboarding dead end: a new profile whose probe errored must still be
    // guided to setup rather than shown a launch that only gets blocked.
    expect(deriveLifecycle({ ...base, authMode: "signed-out" })).toBe(
      "pending-login",
    );
    expect(
      deriveLifecycle({ ...base, authMode: "unknown", providerError: null }),
    ).toBe("pending-login");
    expect(deriveLifecycle({ ...base, providerError: "cli-missing" })).toBe(
      "pending-login",
    );
  });

  it("distinguishes a previously verified profile that is now signed out", () => {
    expect(
      deriveLifecycle({
        ...base,
        authMode: "signed-out",
        verifiedIdentityVerifier: VERIFIER,
      }),
    ).toBe("signed-out");
  });

  it("reports provider-error for a verified profile whose CLI later breaks", () => {
    expect(
      deriveLifecycle({
        ...base,
        authMode: "unknown",
        providerError: "cli-missing",
        verifiedIdentityVerifier: VERIFIER,
      }),
    ).toBe("provider-error");
  });

  it("marks a signed-in but unconfirmed account authenticated-unverified", () => {
    expect(
      deriveLifecycle({
        ...base,
        authMode: "subscription",
        identity: "a***@example.com",
        identityVerifier: VERIFIER,
        verifiedIdentityVerifier: null,
      }),
    ).toBe("authenticated-unverified");

    // A different identity than the one previously confirmed is also unverified.
    expect(
      deriveLifecycle({
        ...base,
        authMode: "subscription",
        identity: "a***@example.com",
        identityVerifier: "b".repeat(64),
        verifiedIdentityVerifier: VERIFIER,
      }),
    ).toBe("authenticated-unverified");
  });

  it("marks a signed-in, identity-matched managed profile verified", () => {
    expect(
      deriveLifecycle({
        ...base,
        authMode: "subscription",
        identity: "a***@example.com",
        identityVerifier: VERIFIER,
        verifiedIdentityVerifier: VERIFIER,
      }),
    ).toBe("verified");
  });

  it("treats current (unmanaged) profiles as verified without confirmation", () => {
    expect(
      deriveLifecycle({
        ...base,
        isManaged: false,
        authMode: "subscription",
        identity: null,
        identityVerifier: null,
      }),
    ).toBe("verified");
  });
});

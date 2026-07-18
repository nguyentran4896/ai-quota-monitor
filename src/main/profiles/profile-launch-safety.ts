import type { ProviderAccountSnapshot } from "../providers/provider-snapshot";
import type { ProviderProfile } from "./profile-store";

export type ProfileLaunchSafetyDecision =
  | { kind: "allow" }
  | { kind: "block"; message: string }
  | {
      kind: "confirm";
      verifyIdentity: {
        maskedIdentity: string;
        verifier: string;
      } | null;
      confirmBilling: boolean;
      title: string;
      message: string;
      detail: string;
    };

export function evaluateProfileLaunchSafety(
  profile: ProviderProfile,
  snapshot: ProviderAccountSnapshot,
): ProfileLaunchSafetyDecision {
  if (snapshot.authMode === "signed-out") {
    return {
      kind: "block",
      message: "Sign in to this profile before launching a work session.",
    };
  }
  if (snapshot.authMode === "unknown" || snapshot.billingMode === "unknown") {
    return {
      kind: "block",
      message:
        "QuotaDeck could not verify this profile's identity and billing mode. Refresh or repair the provider CLI before launching.",
    };
  }
  if (profile.isManaged && (!snapshot.identity || !snapshot.identityVerifier)) {
    return {
      kind: "block",
      message:
        "The provider did not report an account identity. Complete official sign-in and refresh before launching this managed profile.",
    };
  }

  const verifyIdentity =
    profile.isManaged &&
    snapshot.identityVerifier !== profile.verifiedIdentityVerifier
      ? {
          maskedIdentity: snapshot.identity!,
          verifier: snapshot.identityVerifier!,
        }
      : null;
  const confirmBilling = snapshot.billingMode !== "subscription";
  if (!verifyIdentity && !confirmBilling) return { kind: "allow" };

  const identityDetail = snapshot.identity
    ? `Account: ${snapshot.identity}. `
    : "Account identity was not reported. ";
  const billingDetail =
    snapshot.billingMode === "api"
      ? "This session can incur usage-based API charges."
      : snapshot.billingMode === "external"
        ? "This session uses an external cloud provider instead of subscription quota."
        : "This session uses subscription quota.";

  return {
    kind: "confirm",
    verifyIdentity,
    confirmBilling,
    title: confirmBilling ? "Confirm billed session" : "Verify account",
    message: verifyIdentity
      ? `Verify ${profile.displayName} before launch?`
      : `Launch ${profile.displayName}?`,
    detail: `${identityDetail}${billingDetail} A new terminal will be opened; running sessions are never moved between accounts.`,
  };
}

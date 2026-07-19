import type { AccountSnapshot } from "../../shared/contracts";
import type { ProviderProfile } from "../profiles/profile-store";
import { deriveLifecycle } from "./snapshot-policy";

// Collectors build every public field except the derived `lifecycle` (which
// needs the persisted profile's verification history) and carry the private
// `identityVerifier` used to detect account changes before launch.
export interface ProviderAccountSnapshot extends Omit<
  AccountSnapshot,
  "lifecycle"
> {
  identityVerifier: string | null;
}

export function toPublicAccountSnapshot(
  snapshot: ProviderAccountSnapshot,
  profile: Pick<ProviderProfile, "verifiedIdentityVerifier">,
): AccountSnapshot {
  const { identityVerifier, ...publicSnapshot } = snapshot;
  return {
    ...publicSnapshot,
    lifecycle: deriveLifecycle({
      isManaged: snapshot.isManaged,
      authMode: snapshot.authMode,
      identity: snapshot.identity,
      identityVerifier,
      verifiedIdentityVerifier: profile.verifiedIdentityVerifier ?? null,
      providerError: snapshot.providerError,
    }),
  };
}

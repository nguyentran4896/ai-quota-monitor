import type { AccountSnapshot } from "../../shared/contracts";

export interface ProviderAccountSnapshot extends AccountSnapshot {
  identityVerifier: string | null;
}

export function toPublicAccountSnapshot(
  snapshot: ProviderAccountSnapshot,
): AccountSnapshot {
  const { identityVerifier: _identityVerifier, ...publicSnapshot } = snapshot;
  return publicSnapshot;
}

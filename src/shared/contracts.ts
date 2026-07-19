export type ProviderId = "claude" | "codex";
export type AccountState = "ready" | "limited" | "signed-out" | "unknown";
export type AuthenticationMode =
  "subscription" | "api-key" | "external-provider" | "unknown" | "signed-out";
export type BillingMode = "subscription" | "api" | "external" | "unknown";
export type QuotaStatus =
  | "fresh"
  | "stale"
  | "partial"
  | "needs-first-response"
  | "awaiting-refresh"
  | "signed-out"
  | "unavailable";
export type SourceConfidence =
  "provider-reported" | "local-observation" | "unavailable";
// Explicit managed-profile lifecycle. Derived (never persisted) from the
// profile's verification history plus the live provider snapshot, so it cannot
// drift from reality. Drives the "Set up this account" vs "Launch" decision.
export type ManagedProfileLifecycle =
  | "pending-login" // managed profile that has never completed sign-in
  | "signed-out" // previously verified, but the provider now reports signed out
  | "authenticated-unverified" // signed in; masked identity/billing not yet confirmed
  | "verified" // signed in and identity confirmed — safe to launch a work session
  | "provider-error"; // the provider CLI could not be read (see providerError)
// Why the provider CLI could not be read. Kept distinct so QuotaDeck never
// collapses every failure into a single "CLI unavailable" and can offer the
// right recovery action.
export type ProviderErrorReason =
  | "cli-missing" // the official CLI was not found on PATH or the chosen path
  | "cli-timeout" // the CLI was found but did not answer in time
  | "malformed-output" // the CLI ran but returned output QuotaDeck cannot parse
  | "unknown-auth"; // the CLI reported a login method QuotaDeck does not recognize
export type RuntimePlatformId = "windows" | "macos" | "linux" | "unknown";
export type ProviderCommandSource = "path" | "custom";
export type AlertThreshold = 75 | 85 | 95 | null;

export interface RuntimePlatform {
  id: RuntimePlatformId;
  label: string;
  shortcutModifier: "Ctrl" | "⌘";
}

export interface ProviderCapability {
  managedProfiles: boolean;
  reason: string | null;
}

export type ProviderCapabilities = Record<ProviderId, ProviderCapability>;

export interface ProviderCliStatus {
  provider: ProviderId;
  source: ProviderCommandSource;
  callable: boolean;
  compatible: boolean;
  version: string | null;
  message: string;
}

export interface QuotaWindow {
  id: string;
  label: string;
  usedPercent: number;
  windowMinutes: number;
  resetsAt: string | null;
}

export interface SnapshotSource {
  label: string;
  confidence: SourceConfidence;
  observedAt: string;
}

export interface AccountSnapshot {
  id: string;
  provider: ProviderId;
  displayName: string;
  identity: string | null;
  identityVerified: boolean;
  plan: string | null;
  authMode: AuthenticationMode;
  billingMode: BillingMode;
  quotaStatus: QuotaStatus;
  state: AccountState;
  lifecycle: ManagedProfileLifecycle;
  providerError: ProviderErrorReason | null;
  isActive: boolean;
  isManaged: boolean;
  quotaWindows: QuotaWindow[];
  source: SnapshotSource;
  notice: string | null;
}

export interface DashboardSnapshot {
  accounts: AccountSnapshot[];
  observedAt: string;
  mode: "live" | "demo";
  platform: RuntimePlatform;
  capabilities: ProviderCapabilities;
  cliStatus: Record<ProviderId, ProviderCliStatus>;
  alertThresholdPercent: AlertThreshold;
}

export interface AddProfileInput {
  provider: ProviderId;
  displayName: string;
}

export interface ProfileActionResult {
  ok: boolean;
  message: string;
}

export interface QuotaMonitorBridge {
  getDashboard(): Promise<DashboardSnapshot>;
  refresh(): Promise<DashboardSnapshot>;
  addProfile(input: AddProfileInput): Promise<DashboardSnapshot>;
  removeProfile(profileId: string): Promise<ProfileActionResult>;
  renameProfile(
    profileId: string,
    displayName: string,
  ): Promise<ProfileActionResult>;
  beginLogin(profileId: string): Promise<ProfileActionResult>;
  launchProfile(profileId: string): Promise<ProfileActionResult>;
  chooseCliExecutable(provider: ProviderId): Promise<ProfileActionResult>;
  resetCliExecutable(provider: ProviderId): Promise<ProfileActionResult>;
  setAlertThreshold(threshold: AlertThreshold): Promise<ProfileActionResult>;
  openProviderUsage(provider: ProviderId): Promise<ProfileActionResult>;
  openEvidence(): Promise<ProfileActionResult>;
}

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
  beginLogin(profileId: string): Promise<ProfileActionResult>;
  launchProfile(profileId: string): Promise<ProfileActionResult>;
  chooseCliExecutable(provider: ProviderId): Promise<ProfileActionResult>;
  resetCliExecutable(provider: ProviderId): Promise<ProfileActionResult>;
  setAlertThreshold(threshold: AlertThreshold): Promise<ProfileActionResult>;
  openProviderUsage(provider: ProviderId): Promise<ProfileActionResult>;
  openEvidence(): Promise<ProfileActionResult>;
}

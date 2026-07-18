export type ProviderId = "claude" | "codex";
export type AccountState = "ready" | "limited" | "signed-out" | "unknown";
export type SourceConfidence = "provider-reported" | "local-observation" | "unavailable";

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
  plan: string | null;
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
  beginLogin(profileId: string): Promise<ProfileActionResult>;
  launchProfile(profileId: string): Promise<ProfileActionResult>;
}

import path from "node:path";
import type { AlertThreshold, DashboardSnapshot } from "../../shared/contracts";
import {
  describeProviderCapabilities,
  describeRuntimePlatform,
} from "../platform";
import type { ProfileStore, ProviderProfile } from "../profiles/profile-store";
import type { CodexMonitorManager } from "../providers/codex-app-server";
import { collectProviderSnapshot } from "../providers/provider-adapters";
import {
  toPublicAccountSnapshot,
  type ProviderAccountSnapshot,
} from "../providers/provider-snapshot";
import { mapWithConcurrency } from "./concurrency";
import {
  DEFAULT_PROVIDER_COMMANDS,
  type ProviderCommands,
} from "../settings/cli-settings-store";
import { probeProviderCommand } from "../settings/cli-probe";

const DASHBOARD_COLLECTION_CONCURRENCY = 4;

function unsupportedManagedProfile(
  profile: ProviderProfile,
  notice: string,
): ProviderAccountSnapshot {
  const observedAt = new Date().toISOString();
  return {
    id: profile.id,
    provider: profile.provider,
    displayName: profile.displayName,
    identity: null,
    identityVerifier: null,
    identityVerified: false,
    plan: null,
    authMode: "unknown",
    billingMode: "unknown",
    quotaStatus: "unavailable",
    state: "unknown",
    isActive: false,
    isManaged: true,
    quotaWindows: [],
    source: {
      label: "Platform capability guard",
      confidence: "unavailable",
      observedAt,
    },
    notice,
  };
}

export async function collectProfileSnapshot(
  profile: ProviderProfile,
  platform: NodeJS.Platform,
  commands: ProviderCommands = DEFAULT_PROVIDER_COMMANDS,
  codexMonitor?: CodexMonitorManager,
  identityKey?: Uint8Array,
): Promise<ProviderAccountSnapshot> {
  const capability = describeProviderCapabilities(platform)[profile.provider];
  if (profile.isManaged && !capability.managedProfiles) {
    return unsupportedManagedProfile(
      profile,
      capability.reason ?? "This managed profile is unavailable.",
    );
  }

  return collectProviderSnapshot(profile, {
    commands,
    codexMonitor,
    identityKey,
  });
}

export async function collectDashboard(
  profileStore: ProfileStore,
  commands: ProviderCommands = DEFAULT_PROVIDER_COMMANDS,
  codexMonitor?: CodexMonitorManager,
  identityKey?: Uint8Array,
  alertThresholdPercent: AlertThreshold = 85,
): Promise<DashboardSnapshot> {
  const platform = process.platform;
  const [providerAccounts, claudeCli, codexCli] = await Promise.all([
    mapWithConcurrency(
      await profileStore.list(),
      DASHBOARD_COLLECTION_CONCURRENCY,
      (profile) =>
        collectProfileSnapshot(
          profile,
          platform,
          commands,
          codexMonitor,
          identityKey,
        ),
    ),
    probeProviderCommand(
      "claude",
      commands.claude,
      path.isAbsolute(commands.claude) ? "custom" : "path",
    ),
    probeProviderCommand(
      "codex",
      commands.codex,
      path.isAbsolute(commands.codex) ? "custom" : "path",
    ),
  ]);

  return {
    accounts: providerAccounts.map(toPublicAccountSnapshot),
    observedAt: new Date().toISOString(),
    mode: "live",
    platform: describeRuntimePlatform(platform),
    capabilities: describeProviderCapabilities(platform),
    cliStatus: { claude: claudeCli, codex: codexCli },
    alertThresholdPercent,
  };
}

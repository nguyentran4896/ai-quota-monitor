import os from "node:os";
import path from "node:path";
import type {
  AccountSnapshot,
  DashboardSnapshot,
} from "../../shared/contracts";
import {
  describeProviderCapabilities,
  describeRuntimePlatform,
} from "../platform";
import type { ProfileStore, ProviderProfile } from "../profiles/profile-store";
import { collectClaudeSnapshot } from "../providers/claude-auth";
import { collectCodexAppServerSnapshot } from "../providers/codex-app-server";
import { collectCodexSnapshot } from "../providers/codex-session";
import { mapWithConcurrency } from "./concurrency";

const DASHBOARD_COLLECTION_CONCURRENCY = 4;

function unsupportedManagedProfile(
  profile: ProviderProfile,
  notice: string,
): AccountSnapshot {
  const observedAt = new Date().toISOString();
  return {
    id: profile.id,
    provider: profile.provider,
    displayName: profile.displayName,
    plan: null,
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

async function collectProfile(
  profile: ProviderProfile,
  platform: NodeJS.Platform,
) {
  const capability = describeProviderCapabilities(platform)[profile.provider];
  if (profile.isManaged && !capability.managedProfiles) {
    return unsupportedManagedProfile(
      profile,
      capability.reason ?? "This managed profile is unavailable.",
    );
  }

  if (profile.provider === "claude") {
    return collectClaudeSnapshot({
      id: profile.id,
      displayName: profile.displayName,
      configRoot: profile.configRoot,
      quotaRoot: profile.quotaRoot,
      isManaged: profile.isManaged,
    });
  }
  const codexHome = profile.configRoot ?? path.join(os.homedir(), ".codex");
  const options = {
    id: profile.id,
    displayName: profile.displayName,
    isManaged: profile.isManaged,
  };
  try {
    return await collectCodexAppServerSnapshot(codexHome, options);
  } catch {
    const fallback = await collectCodexSnapshot(codexHome, options);
    return {
      ...fallback,
      notice:
        `Official Codex app-server was unavailable; showing the last provider-emitted local session event. ${fallback.notice ?? ""}`.trim(),
    };
  }
}

export async function collectDashboard(
  profileStore: ProfileStore,
): Promise<DashboardSnapshot> {
  const platform = process.platform;
  const accounts = await mapWithConcurrency(
    await profileStore.list(),
    DASHBOARD_COLLECTION_CONCURRENCY,
    (profile) => collectProfile(profile, platform),
  );

  return {
    accounts,
    observedAt: new Date().toISOString(),
    mode: "live",
    platform: describeRuntimePlatform(platform),
    capabilities: describeProviderCapabilities(platform),
  };
}

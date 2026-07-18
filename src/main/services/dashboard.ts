import os from "node:os";
import path from "node:path";
import type { DashboardSnapshot } from "../../shared/contracts";
import type { ProfileStore, ProviderProfile } from "../profiles/profile-store";
import { collectClaudeSnapshot } from "../providers/claude-auth";
import { collectCodexSnapshot } from "../providers/codex-session";

async function collectProfile(profile: ProviderProfile) {
  if (profile.provider === "claude") {
    return collectClaudeSnapshot({
      id: profile.id,
      displayName: profile.displayName,
      configRoot: profile.configRoot,
      isManaged: profile.isManaged,
    });
  }
  return collectCodexSnapshot(profile.configRoot ?? path.join(os.homedir(), ".codex"), {
    id: profile.id,
    displayName: profile.displayName,
    isManaged: profile.isManaged,
  });
}

export async function collectDashboard(profileStore: ProfileStore): Promise<DashboardSnapshot> {
  const accounts = await Promise.all((await profileStore.list()).map(collectProfile));

  return {
    accounts,
    observedAt: new Date().toISOString(),
    mode: "live",
  };
}

import os from "node:os";
import path from "node:path";
import type { DashboardSnapshot } from "../../shared/contracts";
import type { ProfileStore, ProviderProfile } from "../profiles/profile-store";
import { collectClaudeSnapshot } from "../providers/claude-auth";
import { collectCodexSnapshot } from "../providers/codex-session";
import { collectCodexAppServerSnapshot } from "../providers/codex-app-server";

async function collectProfile(profile: ProviderProfile) {
  if (profile.provider === "claude") {
    return collectClaudeSnapshot({
      id: profile.id,
      displayName: profile.displayName,
      configRoot: profile.configRoot,
      isManaged: profile.isManaged,
    });
  }
  const codexHome = profile.configRoot ?? path.join(os.homedir(), ".codex");
  const options = { id: profile.id, displayName: profile.displayName, isManaged: profile.isManaged };
  try {
    return await collectCodexAppServerSnapshot(codexHome, options);
  } catch {
    const fallback = await collectCodexSnapshot(codexHome, options);
    return {
      ...fallback,
      notice: `Official Codex app-server was unavailable; showing the last provider-emitted local session event. ${fallback.notice ?? ""}`.trim(),
    };
  }
}

export async function collectDashboard(profileStore: ProfileStore): Promise<DashboardSnapshot> {
  const accounts = await Promise.all((await profileStore.list()).map(collectProfile));

  return {
    accounts,
    observedAt: new Date().toISOString(),
    mode: "live",
  };
}

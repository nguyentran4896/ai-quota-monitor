import os from "node:os";
import path from "node:path";
import type { ProviderId } from "../../shared/contracts";
import type { ProviderProfile } from "../profiles/profile-store";
import type { ProviderCommands } from "../settings/cli-settings-store";
import { collectClaudeSnapshot } from "./claude-auth";
import {
  collectCodexAppServerSnapshot,
  type CodexMonitorManager,
} from "./codex-app-server";
import { collectCodexSnapshot } from "./codex-session";
import type { ProviderAccountSnapshot } from "./provider-snapshot";

export interface ProviderCollectionContext {
  commands: ProviderCommands;
  codexMonitor?: CodexMonitorManager;
  identityKey?: Uint8Array;
}

export interface ProviderMonitoringContext {
  commands: ProviderCommands;
  codexMonitor: CodexMonitorManager;
}

type ProviderSnapshotCollector = (
  profile: ProviderProfile,
  context: ProviderCollectionContext,
) => Promise<ProviderAccountSnapshot>;

const providerSnapshotCollectors: Record<
  ProviderId,
  ProviderSnapshotCollector
> = {
  claude: async (profile, context) =>
    collectClaudeSnapshot({
      id: profile.id,
      displayName: profile.displayName,
      configRoot: profile.configRoot,
      quotaRoot: profile.quotaRoot,
      isManaged: profile.isManaged,
      verifiedIdentity: profile.verifiedIdentity,
      verifiedIdentityVerifier: profile.verifiedIdentityVerifier,
      identityKey: context.identityKey,
      command: context.commands.claude,
    }),
  codex: async (profile, context) => {
    const codexHome = profile.configRoot ?? path.join(os.homedir(), ".codex");
    const options = {
      id: profile.id,
      displayName: profile.displayName,
      isManaged: profile.isManaged,
      verifiedIdentity: profile.verifiedIdentity,
      verifiedIdentityVerifier: profile.verifiedIdentityVerifier,
      identityKey: context.identityKey,
      command: context.commands.codex,
    };

    try {
      return context.codexMonitor
        ? await context.codexMonitor.collectSnapshot(codexHome, options)
        : await collectCodexAppServerSnapshot(codexHome, options);
    } catch {
      const fallback = await collectCodexSnapshot(codexHome, options);
      return {
        ...fallback,
        notice:
          `Official Codex app-server was unavailable; showing the last provider-emitted local session event. ${fallback.notice ?? ""}`.trim(),
      };
    }
  },
};

const stopMonitoringByProvider: Record<
  ProviderId,
  (profile: ProviderProfile, context: ProviderMonitoringContext) => void
> = {
  claude: () => undefined,
  codex: (profile, context) => {
    if (profile.configRoot) {
      context.codexMonitor.stopProfile(
        profile.configRoot,
        context.commands.codex,
      );
    }
  },
};

export function collectProviderSnapshot(
  profile: ProviderProfile,
  context: ProviderCollectionContext,
): Promise<ProviderAccountSnapshot> {
  return providerSnapshotCollectors[profile.provider](profile, context);
}

export function stopProviderSnapshotMonitoring(
  profile: ProviderProfile,
  context: ProviderMonitoringContext,
): void {
  stopMonitoringByProvider[profile.provider](profile, context);
}

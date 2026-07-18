import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProfileActionResult, ProviderId } from "../../shared/contracts";
import { logoutCodexAppServer } from "../providers/codex-app-server";
import { createProfileEnvironment } from "./profile-environment";
import type { ProviderProfile } from "./profile-store";

const execFileAsync = promisify(execFile);

export interface ProfileLogoutDependencies {
  logoutClaude(configRoot: string): Promise<void>;
  logoutCodex(configRoot: string): Promise<void>;
}

export async function logoutClaudeProfile(
  configRoot: string,
  command = "claude",
): Promise<void> {
  await execFileAsync(command, ["auth", "logout"], {
    env: createProfileEnvironment("claude", configRoot),
    timeout: 15_000,
    windowsHide: true,
    maxBuffer: 64_000,
  });
}

const logoutByProvider: Record<
  ProviderId,
  (configRoot: string, dependencies: ProfileLogoutDependencies) => Promise<void>
> = {
  claude: (configRoot, dependencies) => dependencies.logoutClaude(configRoot),
  codex: (configRoot, dependencies) => dependencies.logoutCodex(configRoot),
};

export async function logoutManagedProfile(
  profile: ProviderProfile,
  dependencies?: ProfileLogoutDependencies,
  command?: string,
): Promise<ProfileActionResult> {
  if (!profile.isManaged || !profile.configRoot) {
    return {
      ok: false,
      message: "Only an isolated managed profile can be signed out here.",
    };
  }

  try {
    const activeDependencies =
      dependencies ??
      ({
        async logoutClaude(configRoot: string) {
          await logoutClaudeProfile(configRoot, command ?? "claude");
        },
        async logoutCodex(configRoot: string) {
          await logoutCodexAppServer(configRoot, 8_000, command ?? "codex");
        },
      } satisfies ProfileLogoutDependencies);
    await logoutByProvider[profile.provider](
      profile.configRoot,
      activeDependencies,
    );
    const providerName =
      profile.provider === "claude" ? "Claude Code" : "Codex";
    return {
      ok: true,
      message: `${profile.displayName} was signed out through ${providerName}.`,
    };
  } catch {
    return {
      ok: false,
      message: `The provider could not sign out ${profile.displayName}. Its profile was kept so you can retry or explicitly remove it without remote logout.`,
    };
  }
}

import { execFile, spawn } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import type { ProfileActionResult } from "../../shared/contracts";
import { describeProviderCapabilities } from "../platform";
import {
  prepareClaudeStatusLine,
  type PrepareClaudeStatusLineOptions,
} from "./claude-statusline-launch";
import { createProfileEnvironment } from "./profile-environment";
import type { ProviderProfile } from "./profile-store";
import {
  createTerminalLaunchCandidates,
  type TerminalLaunchCandidate,
  type TerminalProfileSpec,
} from "./terminal-launcher";

export {
  buildClaudeStatusLineCommand,
  prepareClaudeStatusLine,
} from "./claude-statusline-launch";
export { createTerminalLaunchCandidates } from "./terminal-launcher";

export type ProfileAction = "login" | "work";
export type ProfileLaunchSpec = TerminalProfileSpec;
export type ProfileLauncherOptions = PrepareClaudeStatusLineOptions;
const execFileAsync = promisify(execFile);

export function createProfileLaunchSpec(
  profile: ProviderProfile,
  action: ProfileAction,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
  claudeSettingsPath?: string | null,
): ProfileLaunchSpec {
  const executable = profile.provider === "claude" ? "claude" : "codex";
  const args =
    action === "work"
      ? profile.provider === "claude" && claudeSettingsPath
        ? ["--settings", claudeSettingsPath]
        : []
      : profile.provider === "claude"
        ? ["auth", "login", "--claudeai"]
        : ["login"];
  const environment = createProfileEnvironment(
    profile.provider,
    profile.configRoot,
    baseEnvironment,
  );

  return {
    executable,
    args,
    environment,
    title: `QuotaDeck - ${profile.displayName}`,
  };
}

async function launchCandidate(
  candidate: TerminalLaunchCandidate,
): Promise<void> {
  if (candidate.waitForExit) {
    await execFileAsync(candidate.executable, candidate.args, {
      cwd: candidate.cwd,
      env: candidate.environment,
      timeout: 10_000,
      windowsHide: true,
      maxBuffer: 64_000,
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(candidate.executable, candidate.args, {
      cwd: candidate.cwd,
      env: candidate.environment,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      shell: false,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export async function launchProfile(
  profile: ProviderProfile,
  action: ProfileAction,
  options: ProfileLauncherOptions = {},
): Promise<ProfileActionResult> {
  const platform = options.platform ?? process.platform;
  if (!["win32", "darwin", "linux"].includes(platform)) {
    return {
      ok: false,
      message: `Profile launch is not supported on ${platform}.`,
    };
  }
  const capability = describeProviderCapabilities(platform)[profile.provider];
  if (profile.isManaged && !capability.managedProfiles) {
    return {
      ok: false,
      message:
        capability.reason ??
        "This managed profile is unavailable on the current platform.",
    };
  }

  const statusLine =
    action === "work"
      ? await prepareClaudeStatusLine(profile, options)
      : { settingsPath: null, note: null };
  const spec = createProfileLaunchSpec(
    profile,
    action,
    process.env,
    statusLine.settingsPath,
  );
  try {
    await execFileAsync(spec.executable, ["--version"], {
      env: spec.environment,
      timeout: 5_000,
      windowsHide: true,
      maxBuffer: 64_000,
    });
  } catch {
    const providerName =
      profile.provider === "claude" ? "Claude Code" : "Codex";
    return {
      ok: false,
      message: `${providerName} is not callable as a standalone CLI. Install or repair its official CLI before launching this profile.`,
    };
  }

  const candidates = createTerminalLaunchCandidates(
    platform,
    spec,
    options.homeDirectory ?? os.homedir(),
  );
  for (const candidate of candidates) {
    try {
      await launchCandidate(candidate);
      return {
        ok: true,
        message:
          action === "login"
            ? "Official provider login opened in your system terminal."
            : `Account workspace opened in your system terminal.${statusLine.note ?? ""}`,
      };
    } catch {
      // Try the next terminal supported by this operating system.
    }
  }

  return {
    ok: false,
    message:
      platform === "linux"
        ? "No supported terminal emulator could be started. Install GNOME Terminal, Konsole, Kitty, Alacritty, or xterm."
        : "The system terminal could not be started.",
  };
}

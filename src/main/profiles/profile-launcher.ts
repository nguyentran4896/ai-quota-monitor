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
import { resolveCliInvocation } from "../settings/resolve-cli-command";
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
export interface ProfileLauncherOptions extends PrepareClaudeStatusLineOptions {
  command?: string;
}
const execFileAsync = promisify(execFile);

export function createProfileLaunchSpec(
  profile: ProviderProfile,
  action: ProfileAction,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
  claudeSettingsPath?: string | null,
  command?: string,
): ProfileLaunchSpec {
  const executable =
    command ?? (profile.provider === "claude" ? "claude" : "codex");
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
    provider: profile.provider,
    executable,
    args,
    environment,
    title: `QuotaDeck - ${profile.displayName}`,
  };
}

export async function launchCandidate(
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
    let settled = false;
    let graceTimer: NodeJS.Timeout | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (graceTimer) clearTimeout(graceTimer);
      if (error) reject(error);
      else resolve();
    };
    child.once("error", (error) => finish(error));
    // A terminal that spawns then exits nonzero on incompatible args counts as
    // a failure so the candidate loop can fall through to the next terminal; a
    // clean early exit (fire-and-forget launchers) still counts as success.
    child.once("exit", (code) => {
      if (typeof code === "number" && code !== 0) {
        finish(
          new Error(
            `Terminal "${candidate.executable}" exited with code ${code}.`,
          ),
        );
      } else {
        finish();
      }
    });
    child.once("spawn", () => {
      child.unref();
      if (!candidate.earlyExitGraceMs) {
        finish();
        return;
      }
      // A process still running after the grace window is a healthy terminal.
      graceTimer = setTimeout(() => finish(), candidate.earlyExitGraceMs);
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
    options.command,
  );
  try {
    // Resolve the command through PATH/PATHEXT so Windows npm/pnpm .cmd shims
    // are reachable and invoked safely instead of hitting EINVAL on execFile.
    const invocation = await resolveCliInvocation(
      spec.executable,
      ["--version"],
      spec.environment,
      platform,
    );
    await execFileAsync(invocation.file, invocation.args, {
      env: spec.environment,
      timeout: 5_000,
      windowsHide: true,
      maxBuffer: 64_000,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
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
